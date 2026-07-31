import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { owned, requireUser } from "./lib";

// The auto-apply bucket. Users queue jobs (from the dashboard's top matches,
// the feed, or a job page), pick a resume per entry, then run the queue —
// each entry walks through the attended apply session one at a time. The
// runner (client) advances entries: queued → applying → submitted/manual/
// skipped/failed. Nothing here submits anything by itself.

const ACTIVE = new Set(["queued", "applying"]);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("applyQueue")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const out = [];
    for (const row of rows) {
      const job = await ctx.db.get(row.jobId);
      if (!job) continue;
      const company = await ctx.db.get(job.companyId);
      out.push({
        id: row._id,
        jobId: row.jobId,
        masterResumeId: row.masterResumeId ?? null,
        status: row.status,
        note: row.note ?? null,
        createdAt: row.createdAt,
        title: job.title,
        companyName: company?.name ?? "",
        url: job.url ?? null,
        matchScore: job.matchScore ?? null,
        roleType: job.roleType ?? null,
        jobStatus: job.status,
        hasTailored: !!job.tailoredAt,
      });
    }
    // Queued first (oldest first so the runner order is predictable), then
    // finished entries newest-first.
    return out.sort((a, b) => {
      const aActive = ACTIVE.has(a.status) ? 0 : 1;
      const bActive = ACTIVE.has(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return aActive === 0
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt);
    });
  },
});

export const add = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    const job = owned(await ctx.db.get(jobId), userId);
    if (!job) throw new Error("Job not found.");
    if (!job.url) throw new Error("Job has no application URL.");
    const existing = await ctx.db
      .query("applyQueue")
      .withIndex("by_user_job", (q) => q.eq("userId", userId).eq("jobId", jobId))
      .collect();
    if (existing.some((r) => ACTIVE.has(r.status))) {
      return { added: false, reason: "already queued" };
    }
    const now = new Date().toISOString();
    await ctx.db.insert("applyQueue", {
      userId,
      jobId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    return { added: true };
  },
});

export const remove = mutation({
  args: { id: v.id("applyQueue") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const row = owned(await ctx.db.get(id), userId);
    if (row) await ctx.db.delete(id);
  },
});

export const setResume = mutation({
  args: {
    id: v.id("applyQueue"),
    masterResumeId: v.union(v.id("masterResumes"), v.null()),
  },
  handler: async (ctx, { id, masterResumeId }) => {
    const userId = await requireUser(ctx);
    const row = owned(await ctx.db.get(id), userId);
    if (!row) throw new Error("Queue entry not found.");
    if (masterResumeId) {
      const master = owned(await ctx.db.get(masterResumeId), userId);
      if (!master) throw new Error("Resume not found.");
    }
    await ctx.db.patch(id, {
      masterResumeId: masterResumeId ?? undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("applyQueue"),
    status: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, note }) => {
    const userId = await requireUser(ctx);
    const row = owned(await ctx.db.get(id), userId);
    if (!row) throw new Error("Queue entry not found.");
    if (!["queued", "applying", "submitted", "manual", "skipped", "failed"].includes(status)) {
      throw new Error(`Bad status: ${status}`);
    }
    await ctx.db.patch(id, {
      status,
      note: note ?? undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});

// One row for the runner: the queue entry with the job's apply inputs.
export const getEntry = query({
  args: { id: v.id("applyQueue") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const row = owned(await ctx.db.get(id), userId);
    if (!row) return null;
    return {
      id: row._id,
      jobId: row.jobId,
      masterResumeId: row.masterResumeId ?? null,
      status: row.status,
    };
  },
});
