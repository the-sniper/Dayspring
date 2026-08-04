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

// ---- Phase 2: content approval queue ---------------------------------------

export const insertPost = mutation({
  args: {
    runDate: v.string(),
    platform: v.string(),
    angle: v.string(),
    text: v.string(),
    citations: v.array(v.object({ title: v.string(), url: v.string() })),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert("orchPosts", {
      ...args,
      aiText: args.text,
      userId,
      status: "queued_for_review",
      createdAt: new Date().toISOString(),
    });
  },
});

export const postsByStatus = query({
  args: { status: v.string() },
  handler: async (ctx, { status }) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("orchPosts")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", status),
      )
      .order("desc")
      .take(30);
  },
});

// The only mutation that moves a post through the human gate. Legal moves:
// queued_for_review → approved (with optional edit) | rejected (reason
// required); approved → posted. Returns platform+angle so the caller can file
// the rejection into the lessons memory.
export const decidePost = mutation({
  args: {
    postId: v.id("orchPosts"),
    decision: v.union(
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("posted"),
    ),
    text: v.optional(v.string()),
    rejectReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const post = owned(await ctx.db.get(args.postId), userId);
    if (!post) throw new Error("Post not found.");
    const legal =
      (args.decision === "approved" && post.status === "queued_for_review") ||
      (args.decision === "rejected" && post.status === "queued_for_review") ||
      (args.decision === "posted" && post.status === "approved");
    if (!legal) {
      throw new Error(`Illegal move: ${post.status} → ${args.decision}.`);
    }
    if (args.decision === "rejected" && !args.rejectReason?.trim()) {
      throw new Error("A rejection needs a reason — it feeds the lessons file.");
    }
    await ctx.db.patch(args.postId, {
      status: args.decision,
      ...(args.text ? { text: args.text } : {}),
      ...(args.rejectReason ? { rejectReason: args.rejectReason } : {}),
      decidedAt: new Date().toISOString(),
    });
    return { platform: post.platform, angle: post.angle };
  },
});

// ---- The analytics loop: what a post actually did ---------------------------
// Typed in by the CEO after posting. Without these rows Pulse has nothing but
// its own opinions to reason from, so the strategy review says so out loud
// rather than inventing audience insight.
export const recordPostMetrics = mutation({
  args: {
    postId: v.id("orchPosts"),
    impressions: v.optional(v.number()),
    reactions: v.optional(v.number()),
    comments: v.optional(v.number()),
    reposts: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { postId, ...m }) => {
    const userId = await requireUser(ctx);
    const post = owned(await ctx.db.get(postId), userId);
    if (!post) throw new Error("Post not found.");
    await ctx.db.patch(postId, {
      metrics: { ...m, capturedAt: new Date().toISOString() },
      ...(post.status === "approved"
        ? { status: "posted", postedAt: new Date().toISOString() }
        : {}),
    });
    return null;
  },
});

// Everything published, newest first — the raw material for Pulse's review and
// for the performance table in the Studio.
export const postsForAnalysis = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUser(ctx);
    const posted = await ctx.db
      .query("orchPosts")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "posted"),
      )
      .order("desc")
      .take(Math.min(limit ?? 40, 100));
    return posted.map((p) => ({
      id: String(p._id),
      runDate: p.runDate,
      platform: p.platform,
      pillar: p.pillar ?? null,
      format: p.format ?? null,
      hookType: p.hookType ?? null,
      topicTitle: p.topicTitle ?? null,
      angle: p.angle,
      text: p.text,
      aiText: p.aiText,
      postedAt: p.postedAt ?? p.decidedAt ?? p.createdAt,
      metrics: p.metrics ?? null,
    }));
  },
});

// Rejections carry the reason the CEO gave — the other half of the signal.
export const rejectedPosts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("orchPosts")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "rejected"),
      )
      .order("desc")
      .take(Math.min(limit ?? 20, 50));
    return rows.map((p) => ({
      id: String(p._id),
      pillar: p.pillar ?? null,
      angle: p.angle,
      reason: p.rejectReason ?? "",
      decidedAt: p.decidedAt ?? p.createdAt,
    }));
  },
});

// ---- Phase 3: Herald's candidate pool ---------------------------------------
// Contacts that are actually reachable TODAY without spending a credit:
// email on file, never contacted, ranked by affiliation strength (the reply
// trigger) and whether their company has a live high-fit job. Herald researches
// these; it can never search Apollo/Happenstance itself (credits stay
// click-gated in the existing UI).
export const heraldCandidates = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const userId = await requireUser(ctx);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);
    const outreachRows = await ctx.db
      .query("outreach")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);
    const contacted = new Set(outreachRows.map((o) => String(o.contactId)));

    const eligible = contacts.filter(
      (c) => c.email && !contacted.has(String(c._id)),
    );
    const out = [];
    for (const c of eligible.slice(0, 60)) {
      const affiliations = await ctx.db
        .query("affiliations")
        .withIndex("by_contact", (q) => q.eq("contactId", c._id))
        .take(10);
      const company = c.companyId ? await ctx.db.get(c.companyId) : null;
      let topJob: { id: string; title: string; matchScore: number } | null =
        null;
      if (c.companyId) {
        const jobs = await ctx.db
          .query("jobs")
          .withIndex("by_company", (q) => q.eq("companyId", c.companyId!))
          .take(50);
        const best = jobs
          .filter((j) => (j.matchScore ?? 0) >= 60 && j.status !== "rejected")
          .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))[0];
        if (best) {
          topJob = {
            id: String(best._id),
            title: best.title,
            matchScore: best.matchScore ?? 0,
          };
        }
      }
      const maxAffinity = Math.max(0, ...affiliations.map((a) => a.strength));
      out.push({
        id: String(c._id),
        name: c.name,
        title: c.title ?? null,
        companyName: company?.name ?? null,
        linkedin: c.linkedin ?? null,
        summary: c.summary ?? null,
        notes: c.notes ?? null,
        affiliations: affiliations.map((a) => ({
          kind: a.kind,
          detail: a.detail,
          strength: a.strength,
        })),
        maxAffinity,
        topJob,
      });
    }
    // Reply-trigger ranking: affiliation strength first, then live-job fit.
    out.sort(
      (a, b) =>
        b.maxAffinity - a.maxAffinity ||
        (b.topJob?.matchScore ?? 0) - (a.topJob?.matchScore ?? 0),
    );
    return out.slice(0, Math.min(limit, 10));
  },
});

// Latest artifact of a given kind (e.g. the newest weekly retro).
export const latestArtifactOfKind = query({
  args: { kind: v.string() },
  handler: async (ctx, { kind }) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("orchArtifacts")
      .withIndex("by_user_runDate", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    return rows.find((a) => a.kind === kind) ?? null;
  },
});

// ---- Vigil's raw material: a cheap, bounded snapshot of platform state -----
// The watcher (lib/orchestra/watch.ts) fingerprints this + the memory files +
// the tier every run and tells Atlas what changed since yesterday.
export const platformState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10);
    const newestProfile = [...profiles].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )[0];
    const resumes = await ctx.db
      .query("masterResumes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(50);
    const newestResume = [...resumes].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )[0];
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);
    return {
      profileUpdatedAt: newestProfile?.updatedAt ?? null,
      profileHeadline: newestProfile?.headline ?? null,
      profileName: newestProfile?.fullName ?? null,
      resumeCount: resumes.length,
      resumeUpdatedAt: newestResume?.updatedAt ?? null,
      primaryResumeLabel: resumes.find((r) => r.isPrimary)?.label ?? null,
      companiesCount: companies.length,
      contactsCount: contacts.length,
    };
  },
});

// One employee's work history — the /company/team/[id] view.
export const tasksByRole = query({
  args: { role: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { role, limit }) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("orchTasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(300);
    return rows.filter((t) => t.role === role).slice(0, Math.min(limit ?? 40, 100));
  },
});
