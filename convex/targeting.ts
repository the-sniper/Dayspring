import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { owned, requireUser } from "./lib";
import { levelOrDefault } from "../shared/seniority";

// Convex mutations are transactions with read/write ceilings, so the level
// backfill walks the user's jobs in batches and reschedules itself until it
// runs dry (the pattern the Convex guidelines prescribe for bulk work).
const BATCH = 200;

// There is no index on `level`, so each pass scans the user's jobs and patches
// the first BATCH rows still missing one. Patched rows drop out of the
// candidate set, so the next pass finds different work and the loop converges
// without tracking an offset (a growing .take() would read more and more rows
// per transaction until it hit Convex's limit).
async function backfillBatch(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<{ updated: number; remaining: number }> {
  const rows = await ctx.db
    .query("jobs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(5000);

  const pending = rows.filter((j) => j.level === undefined);
  for (const job of pending.slice(0, BATCH)) {
    await ctx.db.patch(job._id, { level: levelOrDefault(job.title) });
  }

  const updated = Math.min(pending.length, BATCH);
  const remaining = pending.length - updated;
  if (remaining > 0) {
    await ctx.scheduler.runAfter(0, internal.targeting.continueLevelBackfill, {
      userId,
    });
  }
  return { updated, remaining };
}

export const backfillMyLevels = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await backfillBatch(ctx, userId);
  },
});

// Internal continuation — userId is safe here because it is not reachable
// from the public API and the first hop already authenticated the caller.
export const continueLevelBackfill = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await backfillBatch(ctx, userId);
  },
});

// How much of the user's data still lacks targeting metadata — drives the
// "enrich" prompt in Settings and the feed banner.
export const targetingCoverage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(2000);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(5000);
    // Only domain-bearing companies can be enriched, so companies without one
    // are excluded from both sides of the ratio — otherwise the setup panel
    // could never reach "done" and would nag forever.
    const enrichable = companies.filter((c) => !!c.domain);
    return {
      companies: enrichable.length,
      companiesWithSize: enrichable.filter((c) => c.headcount !== undefined).length,
      jobs: jobs.length,
      jobsWithLevel: jobs.filter((j) => j.level !== undefined).length,
    };
  },
});

// Companies still missing headcount, oldest first — the enrichment action
// pulls its worklist from here so a re-run never re-spends credits.
export const companiesNeedingSize = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("companies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(2000);
    return rows
      .filter((c) => c.enrichedAt === undefined && !!c.domain)
      .slice(0, limit)
      .map((c) => ({ id: c._id, name: c.name, domain: c.domain! }));
  },
});

export const setCompanySize = mutation({
  args: {
    id: v.id("companies"),
    headcount: v.optional(v.number()),
    foundedYear: v.optional(v.number()),
  },
  handler: async (ctx, { id, headcount, foundedYear }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) return;
    const patch: Record<string, unknown> = { enrichedAt: new Date().toISOString() };
    if (headcount !== undefined) patch.headcount = headcount;
    if (foundedYear !== undefined) patch.foundedYear = foundedYear;
    await ctx.db.patch(id, patch);
  },
});
