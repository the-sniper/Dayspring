import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { CATALOG_ENTRIES } from "./catalog";

// DESTRUCTIVE, INTERNAL-ONLY maintenance. Deliberately not a `mutation` — it
// must never be reachable from the public API or a UI button. Invoke it by
// hand, repeatedly, until it returns done:true:
//
//   npx convex run maintenance:wipeAllJobData '{}'
//
// Clears every job-derived row across ALL users so the feed can be rebuilt
// from a changed catalog. Jobs are re-pullable from the ATS boards; the
// application/stage/queue rows are NOT, so this is a one-way door.
//
// Explicitly NOT touched: companies, contacts, affiliations, outreach,
// profiles, masterResumes, settings (API keys, Gmail tokens, onboarding).
//
// It does ONE batch per call and does not self-schedule. An earlier
// self-rescheduling version silently died mid-run — a broken chain leaves no
// way to observe progress, whereas a caller-driven loop reports every batch.
//
// Batch sizes are per-table because Convex caps BYTES READ per transaction
// (16 MiB), not document count: jobDescriptions carry the full JD text and
// measured ~15 KiB each, so 1000 of them read ~15 MiB and nearly blew the
// limit. 600 keeps the largest table around 9 MiB.
const TABLES = [
  ["jobDescriptions", 600],
  ["applications", 1000],
  ["stageEvents", 1000],
  ["applyQueue", 1000],
  ["generatedResumes", 200],
  ["jobs", 2000],
] as const;

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

// Copy curated catalog headcounts onto company rows that predate the field.
// Name-matched because the catalog is keyed by name, and a company row seeded
// from it keeps that name verbatim.
export const backfillHeadcountsFromCatalog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const byName = new Map<string, number>();
    for (const c of CATALOG_ENTRIES) {
      if (typeof c.headcount === "number") byName.set(norm(c.name), c.headcount);
    }
    const companies = await ctx.db.query("companies").take(4000);
    let patched = 0;
    for (const c of companies) {
      if (patched >= 500) break;
      if (c.headcount !== undefined) continue;
      const hc = byName.get(norm(c.name));
      if (hc === undefined) continue;
      await ctx.db.patch(c._id, { headcount: hc });
      patched++;
    }
    return { patched, done: patched < 500 };
  },
});

// Delete jobs belonging to companies above the headcount ceiling, along with
// their JD side-table rows. Companies of UNKNOWN size are left alone — the
// same rule the feed and pull use, so this never removes something the
// targeting system would have kept.
export const purgeOversizedJobs = internalMutation({
  args: { maxHeadcount: v.number() },
  handler: async (ctx, { maxHeadcount }) => {
    const companies = await ctx.db.query("companies").take(4000);
    const over = new Set(
      companies
        .filter((c) => c.headcount !== undefined && c.headcount > maxHeadcount)
        .map((c) => String(c._id)),
    );
    if (over.size === 0) {
      return { deleted: 0, done: true, oversizedCompanies: 0 };
    }

    const jobs = await ctx.db.query("jobs").take(4000);
    const doomed = jobs.filter((j) => over.has(String(j.companyId))).slice(0, 200);
    for (const job of doomed) {
      const jd = await ctx.db
        .query("jobDescriptions")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .unique();
      if (jd) await ctx.db.delete(jd._id);
      await ctx.db.delete(job._id);
    }
    return {
      deleted: doomed.length,
      done: doomed.length === 0,
      oversizedCompanies: over.size,
    };
  },
});

// Read-only audit: what jobs remain, grouped by company and size. Used to
// confirm a purge left only on-target companies behind.
export const remainingJobsByCompany = internalQuery({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").take(4000);
    const byCompany = new Map<string, number>();
    for (const j of jobs) {
      const k = String(j.companyId);
      byCompany.set(k, (byCompany.get(k) ?? 0) + 1);
    }
    const out: { company: string; headcount: number | null; jobs: number }[] = [];
    for (const [id, count] of byCompany) {
      const c = await ctx.db.get(id as Id<"companies">);
      out.push({
        company: c?.name ?? "(unknown)",
        headcount: c?.headcount ?? null,
        jobs: count,
      });
    }
    return {
      totalJobs: jobs.length,
      companies: out.sort((a, b) => b.jobs - a.jobs),
    };
  },
});

// Dry run of the pull's company selection for one user: which boards would be
// fetched at a given ceiling, and which slip through because their size is
// unknown. Read-only — answers "what will Pull actually do?" without spending
// a pull.
export const pullPreview = internalQuery({
  args: { userId: v.id("users"), maxHeadcount: v.number() },
  handler: async (ctx, { userId, maxHeadcount }) => {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(4000);

    // Mirrors lib/jobs/pull.ts: only companies with a usable ATS locator are
    // ever fetched. Rows without one (e.g. aggregator-created) are inert.
    const watched = companies.filter(
      (c) =>
        !!c.atsType &&
        (!!c.atsSlug ||
          (c.atsType === "workday" && !!c.atsTenant && !!c.atsHost && !!c.atsSite)),
    );

    const tooBig = watched.filter(
      (c) => c.headcount !== undefined && c.headcount > maxHeadcount,
    );
    const kept = watched.filter(
      (c) => c.headcount === undefined || c.headcount <= maxHeadcount,
    );
    const unknown = kept.filter((c) => c.headcount === undefined);

    return {
      totalCompanies: companies.length,
      watchedBoards: watched.length,
      wouldSkipTooBig: tooBig.length,
      wouldFetch: kept.length,
      unknownSizeFetched: unknown.length,
      // Smallest first — the order the job budget is spent in.
      firstUp: kept
        .filter((c) => c.headcount !== undefined)
        .sort((a, b) => a.headcount! - b.headcount!)
        .slice(0, 10)
        .map((c) => `${c.name} (${c.headcount})`),
      unknownNames: unknown.slice(0, 25).map((c) => c.name),
    };
  },
});

export const wipeAllJobData = internalMutation({
  args: {},
  handler: async (ctx) => {
    // One table per invocation: batching several tables into a single
    // transaction sums their reads toward the same byte ceiling.
    for (const [table, batch] of TABLES) {
      const rows = await ctx.db.query(table).take(batch);
      if (rows.length === 0) continue;
      for (const row of rows) await ctx.db.delete(row._id);
      return { table, deleted: rows.length, done: false };
    }
    return { table: null, deleted: 0, done: true };
  },
});

// Move master résumés between two accounts. INTERNAL-ONLY: reassigning rows
// across users is never something a UI button should do.
//
//   npx convex run maintenance:reassignMasterResumes '{"fromUserId":"...","toUserId":"..."}'
//
// Why this exists: signing in through a second auth provider with the same
// email creates a SECOND users row, and every query is user-scoped — so the
// résumés uploaded under the first account become invisible to the second.
// Apply-assist then reports "no résumé PDF for this account" and leaves the
// upload box empty, which is the whole point of the run.
//
// Nothing is deleted or overwritten: only the userId column moves. The PDFs
// live in Convex storage, which is not user-scoped, so they follow the row.
export const reassignMasterResumes = internalMutation({
  args: {
    fromUserId: v.string(),
    toUserId: v.string(),
    // Dry run by default — report what WOULD move before moving it.
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, { fromUserId, toUserId, apply }) => {
    const to = await ctx.db.get(toUserId as Id<"users">);
    if (!to) throw new Error(`Destination user ${toUserId} does not exist.`);
    const rows = (await ctx.db.query("masterResumes").collect()).filter(
      (r) => r.userId === (fromUserId as Id<"users">),
    );
    const moved = rows.map((r) => ({
      id: r._id,
      label: r.label,
      isPrimary: !!r.isPrimary,
      hasPdf: !!r.sourceFileId || !!r.sourceFile,
    }));
    if (!apply) return { dryRun: true, wouldMove: moved };
    for (const r of rows) {
      await ctx.db.patch(r._id, {
        userId: toUserId as Id<"users">,
        updatedAt: new Date().toISOString(),
      });
    }
    return { dryRun: false, moved };
  },
});

// Set one application-default field on a user's profile. INTERNAL-ONLY: the
// Profile page owns this data, and its toggles are the normal way to change it
// (components/profile-studio.tsx). This exists for setting a value on the
// user's behalf when they've stated it explicitly, without a round trip
// through the UI.
//
//   npx convex run maintenance:setApplicationDefault \
//     '{"userId":"...","key":"workedForCompanyBefore","boolValue":false}'
export const setApplicationDefault = internalMutation({
  args: {
    userId: v.string(),
    key: v.string(),
    boolValue: v.optional(v.boolean()),
    stringValue: v.optional(v.string()),
  },
  handler: async (ctx, { userId, key, boolValue, stringValue }) => {
    const profiles = (await ctx.db.query("profiles").collect()).filter(
      (p) => p.userId === (userId as Id<"users">),
    );
    if (profiles.length === 0) throw new Error(`No profile rows for user ${userId}.`);
    const value = boolValue !== undefined ? boolValue : (stringValue ?? null);
    const touched: string[] = [];
    for (const p of profiles) {
      const defaults = { ...((p.defaults ?? {}) as Record<string, unknown>), [key]: value };
      await ctx.db.patch(p._id, { defaults, updatedAt: new Date().toISOString() });
      touched.push(p.name ?? p._id);
    }
    return { key, value, profiles: touched };
  },
});

// Read-only snapshot of one orchestra run — which tasks are still ACTIVE (the
// statuses that make /api/orchestra/run report "already running"), how long
// they have been sitting there, and whether a report landed.
//
//   npx convex run maintenance:orchRunSummary '{"runDate":"2026-08-04"}'
export const orchRunSummary = internalQuery({
  args: { runDate: v.string() },
  handler: async (ctx, { runDate }) => {
    const tasks = (await ctx.db.query("orchTasks").collect()).filter(
      (t) => t.runDate === runDate,
    );
    const reports = (await ctx.db.query("orchReports").collect()).filter(
      (r) => r.runDate === runDate,
    );
    const ACTIVE = new Set(["queued", "in_progress", "delivered"]);
    return {
      runDate,
      reportExists: reports.length > 0,
      counts: tasks.reduce<Record<string, number>>((acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      }, {}),
      active: tasks
        .filter((t) => ACTIVE.has(t.status))
        .map((t) => ({
          role: t.role,
          status: t.status,
          attempts: t.attempts,
          updatedAt: t.updatedAt,
          reason: (t.statusReason ?? "").slice(0, 120),
        })),
      recent: tasks
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 8)
        .map((t) => `${t.updatedAt} ${t.role} ${t.status} ${(t.statusReason ?? "").slice(0, 80)}`),
    };
  },
});

// Retire orchestra tasks left in an ACTIVE status by a run that died. Those
// statuses are what /api/orchestra/run treats as "already running", so one
// stranded task deadlocks the day: no new run may start, and the only thing
// that retires stale tasks IS a new run.
//
//   npx convex run maintenance:failStaleOrchTasks '{"runDate":"2026-08-04","olderThanMinutes":10,"apply":true}'
export const failStaleOrchTasks = internalMutation({
  args: {
    runDate: v.string(),
    olderThanMinutes: v.optional(v.number()),
    apply: v.optional(v.boolean()),
  },
  handler: async (ctx, { runDate, olderThanMinutes, apply }) => {
    const ACTIVE = new Set(["queued", "in_progress", "delivered"]);
    const cutoffMs = Date.now() - (olderThanMinutes ?? 10) * 60_000;
    const stale = (await ctx.db.query("orchTasks").collect()).filter(
      (t) =>
        t.runDate === runDate &&
        ACTIVE.has(t.status) &&
        Date.parse(t.updatedAt) < cutoffMs,
    );
    const listed = stale.map((t) => `${t.role}/${t.status} last moved ${t.updatedAt}`);
    if (!apply) return { dryRun: true, wouldRetire: listed };
    for (const t of stale) {
      await ctx.db.patch(t._id, {
        status: "failed",
        statusReason: "Abandoned — the run stopped making progress and was retired.",
        updatedAt: new Date().toISOString(),
      });
    }
    return { dryRun: false, retired: listed };
  },
});
