import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { owned, requireUser } from "./lib";

export const getByJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(jobId), userId)) return null;
    const row = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .unique();
    return row ? { ...row, id: row._id } : null;
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({ ...r, id: r._id }));
  },
});

export const patch = mutation({
  args: { id: v.id("applications"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) throw new Error("Application not found");
    await ctx.db.patch(id, patch);
  },
});

// Patch the application row belonging to a job (job detail's "Application" form).
export const patchByJob = mutation({
  args: { jobId: v.id("jobs"), patch: v.any() },
  handler: async (ctx, { jobId, patch }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(jobId), userId)) return;
    const row = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .unique();
    if (row) await ctx.db.patch(row._id, patch);
  },
});
