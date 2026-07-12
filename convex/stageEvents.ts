import { v } from "convex/values";
import { query } from "./_generated/server";

// Recent activity across all jobs (dashboard timeline). Joined with job+company.
export const recent = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const events = await ctx.db
      .query("stageEvents")
      .withIndex("by_at")
      .order("desc")
      .take(limit);
    const out = [];
    for (const e of events) {
      const job = await ctx.db.get(e.jobId);
      const company = job ? await ctx.db.get(job.companyId) : null;
      out.push({
        ...e,
        id: e._id,
        jobTitle: job?.title ?? null,
        companyName: company?.name ?? null,
      });
    }
    return out;
  },
});
