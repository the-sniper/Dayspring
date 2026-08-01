import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { owned, requireUser } from "./lib";

// Agent-orchestra board (docs/agent-orchestra-final-plan.md, Phase 1).
// State machine lives here so the accountability rules are enforced at the
// data layer, not by prompt goodwill:
//   - contracts are immutable once created (no mutation exposes them)
//   - `verified` can only be set through recordVerdict (Sentinel's path)
//   - every model call must be ledgered (lib/orchestra/ledger.ts)

const CONTRACT = {
  runDate: v.string(),
  role: v.string(),
  objective: v.string(),
  definitionOfDone: v.array(v.string()),
  boundaries: v.array(v.string()),
  budgets: v.object({
    maxOutputTokens: v.number(),
    maxToolCalls: v.number(),
    maxUsd: v.number(),
  }),
};

export const createTask = mutation({
  args: CONTRACT,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("orchTasks", {
      ...args,
      userId,
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Working-state transitions only. `verified`/`rejected` are NOT accepted here —
// those flow exclusively through recordVerdict so the doer can never
// self-certify.
export const setTaskStatus = mutation({
  args: {
    taskId: v.id("orchTasks"),
    status: v.union(
      v.literal("queued"),
      v.literal("in_progress"),
      v.literal("blocked"),
      v.literal("delivered"),
      v.literal("escalated"),
      v.literal("failed"),
    ),
    statusReason: v.optional(v.string()),
    bumpAttempts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const task = owned(await ctx.db.get(args.taskId), userId);
    if (!task) throw new Error("Task not found.");
    await ctx.db.patch(args.taskId, {
      status: args.status,
      ...(args.statusReason ? { statusReason: args.statusReason } : {}),
      ...(args.bumpAttempts ? { attempts: task.attempts + 1 } : {}),
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const attachArtifact = mutation({
  args: {
    taskId: v.id("orchTasks"),
    runDate: v.string(),
    role: v.string(),
    kind: v.string(),
    honestStatus: v.string(),
    summary: v.string(),
    body: v.string(),
    citations: v.array(v.object({ title: v.string(), url: v.string() })),
    missing: v.optional(v.array(v.string())),
    uncertainties: v.optional(v.array(v.string())),
    model: v.string(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const task = owned(await ctx.db.get(args.taskId), userId);
    if (!task) throw new Error("Task not found.");
    const artifactId = await ctx.db.insert("orchArtifacts", {
      ...args,
      userId,
      createdAt: new Date().toISOString(),
    });
    await ctx.db.patch(args.taskId, {
      artifactId,
      status: "delivered",
      updatedAt: new Date().toISOString(),
    });
    return artifactId;
  },
});

// Sentinel's exclusive path to `verified`. A `needs_work`/`refuted` verdict
// sends the task back to `queued` (retry) or `escalated` (out of attempts) —
// decided by the caller via `onFail`.
export const recordVerdict = mutation({
  args: {
    taskId: v.id("orchTasks"),
    verdict: v.union(
      v.literal("confirmed"),
      v.literal("needs_work"),
      v.literal("refuted"),
    ),
    verificationNotes: v.string(),
    onFail: v.optional(v.union(v.literal("queued"), v.literal("escalated"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const task = owned(await ctx.db.get(args.taskId), userId);
    if (!task) throw new Error("Task not found.");
    if (task.status !== "delivered") {
      throw new Error(
        `Cannot verify a task in status "${task.status}" — only delivered work gets verdicts.`,
      );
    }
    const status =
      args.verdict === "confirmed" ? "verified" : (args.onFail ?? "escalated");
    await ctx.db.patch(args.taskId, {
      verdict: args.verdict,
      verificationNotes: args.verificationNotes,
      status,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const tasksForRun = query({
  args: { runDate: v.string() },
  handler: async (ctx, { runDate }) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("orchTasks")
      .withIndex("by_user_runDate", (q) =>
        q.eq("userId", userId).eq("runDate", runDate),
      )
      .take(200);
  },
});

export const getArtifact = query({
  args: { artifactId: v.id("orchArtifacts") },
  handler: async (ctx, { artifactId }) => {
    const userId = await requireUser(ctx);
    return owned(await ctx.db.get(artifactId), userId);
  },
});

export const insertIncident = mutation({
  args: {
    runDate: v.string(),
    taskId: v.optional(v.id("orchTasks")),
    role: v.string(),
    kind: v.string(),
    severity: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert("orchIncidents", {
      ...args,
      userId,
      createdAt: new Date().toISOString(),
    });
  },
});

export const insertLedger = mutation({
  args: {
    runDate: v.string(),
    role: v.string(),
    taskId: v.optional(v.id("orchTasks")),
    model: v.string(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    cacheReadTokens: v.number(),
    cacheWriteTokens: v.number(),
    costUsd: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert("orchLedger", {
      ...args,
      userId,
      createdAt: new Date().toISOString(),
    });
  },
});

// Today's spend — read BEFORE every model call by the Ledger guard. Bounded:
// a day produces tens of rows, 500 is a generous ceiling.
export const spendForDate = query({
  args: { runDate: v.string() },
  handler: async (ctx, { runDate }) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("orchLedger")
      .withIndex("by_user_runDate", (q) =>
        q.eq("userId", userId).eq("runDate", runDate),
      )
      .take(500);
    let costUsd = 0;
    for (const r of rows) costUsd += r.costUsd;
    return { costUsd, calls: rows.length };
  },
});

export const insertReport = mutation({
  args: {
    runDate: v.string(),
    body: v.string(),
    stats: v.object({
      tasksTotal: v.number(),
      verified: v.number(),
      rejected: v.number(),
      blocked: v.number(),
      escalated: v.number(),
      costUsd: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert("orchReports", {
      ...args,
      userId,
      createdAt: new Date().toISOString(),
    });
  },
});

// Report for a given date (or the most recent one when runDate is omitted).
export const latestReport = query({
  args: { runDate: v.optional(v.string()) },
  handler: async (ctx, { runDate }) => {
    const userId = await requireUser(ctx);
    if (runDate) {
      const rows = await ctx.db
        .query("orchReports")
        .withIndex("by_user_runDate", (q) =>
          q.eq("userId", userId).eq("runDate", runDate),
        )
        .take(5);
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return rows[0] ?? null;
    }
    const rows = await ctx.db
      .query("orchReports")
      .withIndex("by_user_runDate", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

// Scorecard rollup for the weekly review — computed, not LLM-judged.
export const scorecard = query({
  args: { sinceDate: v.string() },
  handler: async (ctx, { sinceDate }) => {
    const userId = await requireUser(ctx);
    const tasks = await ctx.db
      .query("orchTasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(500);
    const relevant = tasks.filter((t) => t.runDate >= sinceDate);
    const byRole: Record<
      string,
      {
        total: number;
        verified: number;
        rejected: number;
        blocked: number;
        escalated: number;
        retries: number;
      }
    > = {};
    for (const t of relevant) {
      const r = (byRole[t.role] ??= {
        total: 0,
        verified: 0,
        rejected: 0,
        blocked: 0,
        escalated: 0,
        retries: 0,
      });
      r.total += 1;
      if (t.status === "verified") r.verified += 1;
      if (t.verdict === "refuted") r.rejected += 1;
      if (t.status === "blocked") r.blocked += 1;
      if (t.status === "escalated") r.escalated += 1;
      if (t.attempts > 1) r.retries += t.attempts - 1;
    }
    return byRole;
  },
});

// Recent tasks across runs — the /company board view. by_user index returns
// ascending _creationTime; order desc + take gives the newest first.
export const recentTasks = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("orchTasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(limit ?? 30, 200));
  },
});

export const recentIncidents = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("orchIncidents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});
