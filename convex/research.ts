import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const insert = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => await ctx.db.insert("researchBriefs", doc),
});

// Latest brief for a job (append-only history; newest createdAt wins).
export const latestForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const rows = await ctx.db
      .query("researchBriefs")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .collect();
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows[0] ? { ...rows[0], id: rows[0]._id } : null;
  },
});

export const latestForCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const rows = await ctx.db
      .query("researchBriefs")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows[0] ? { ...rows[0], id: rows[0]._id } : null;
  },
});
