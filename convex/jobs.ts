import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { owned, requireUser } from "./lib";
import { getOnboardingPrefs } from "./onboarding";
import { sizeBand as bandOf } from "../shared/company-size";
import { isPastRetention, isWithinRetention } from "../shared/job-retention";

// The JD text lives in the `jobDescriptions` side table (see schema). These
// helpers read/write it by jobId so the rest of the app can keep treating
// `description` as if it were a column on the job. Ownership derives from the
// parent job — callers verify the job first.
async function readDescription(
  ctx: QueryCtx,
  jobId: Id<"jobs">,
): Promise<string> {
  const row = await ctx.db
    .query("jobDescriptions")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .unique();
  return row?.text ?? "";
}

async function writeDescription(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  text: string,
): Promise<void> {
  const existing = await ctx.db
    .query("jobDescriptions")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, { text });
  else await ctx.db.insert("jobDescriptions", { jobId, text });
}

// The user's jobs (whole set — job rows are small; the JD lives elsewhere).
// Hard retention: rows older than JOB_MAX_AGE_DAYS never leave these helpers,
// so every portal surface that reads through them stays clean between purges.
async function userJobs(ctx: QueryCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("jobs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.filter(isWithinRetention);
}

async function userJobsByStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
  status: string,
) {
  const rows = await ctx.db
    .query("jobs")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", status),
    )
    .collect();
  return rows.filter(isWithinRetention);
}

// Company-name lookup map, scoped to the user's companies.
async function companyNames(ctx: QueryCtx, userId: Id<"users">) {
  const companies = await ctx.db
    .query("companies")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Map(companies.map((c) => [String(c._id), c.name]));
}

// ---- reads -------------------------------------------------------------

export const getById = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    return owned(await ctx.db.get(id), userId);
  },
});

// Full job list joined with company name — used by backfill/scripts which
// scan the user's whole table anyway.
export const listAllWithCompany = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const jobs = await userJobs(ctx, userId);
    const nameById = await companyNames(ctx, userId);
    return jobs.map((j) => ({
      ...j,
      id: j._id,
      companyName: nameById.get(String(j.companyId)) ?? "",
    }));
  },
});

// The JD text for one job (fetched on demand — kept out of list scans).
export const getDescription = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const job = owned(await ctx.db.get(id), userId);
    if (!job) return "";
    return await readDescription(ctx, id);
  },
});

// Per-status row counts (dashboard funnel + digest).
export const statusCounts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const jobs = await userJobs(ctx, userId);
    const counts: Record<string, number> = {};
    for (const j of jobs) counts[j.status] = (counts[j.status] ?? 0) + 1;
    return counts;
  },
});

// Enriched jobs in the given statuses (board columns, active-app joins). Bounded
// because triaged statuses are a tiny slice of the table.
export const byStatuses = query({
  args: { statuses: v.array(v.string()) },
  handler: async (ctx, { statuses }) => {
    const userId = await requireUser(ctx);
    const nameById = await companyNames(ctx, userId);
    const groups = await Promise.all(
      statuses.map((status) => userJobsByStatus(ctx, userId, status)),
    );
    return groups.flat().map((j) => ({
      ...j,
      id: j._id,
      companyName: nameById.get(String(j.companyId)) ?? "",
    }));
  },
});

// Top `limit` "new" jobs at or above `minScore`, score desc (dashboard "needs a
// decision" + digest high-fit). Reads the new-status slice, returns a few rows.
export const topNewByScore = query({
  args: { limit: v.number(), minScore: v.number() },
  handler: async (ctx, { limit, minScore }) => {
    const userId = await requireUser(ctx);
    const nameById = await companyNames(ctx, userId);
    const rows = await userJobsByStatus(ctx, userId, "new");
    return rows
      .filter((j) => (j.matchScore ?? -1) >= minScore)
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
      .slice(0, limit)
      .map((j) => ({
        ...j,
        id: j._id,
        companyName: nameById.get(String(j.companyId)) ?? "",
      }));
  },
});

// Scoring queue: the newest `limit` unscored new/wishlist jobs with a
// long-enough JD, plus totals. Returns bounded rows so scoring scales.
export const unscoredScorable = query({
  args: { limit: v.number(), minJdChars: v.number() },
  handler: async (ctx, { limit, minJdChars }) => {
    const userId = await requireUser(ctx);
    const nameById = await companyNames(ctx, userId);
    const eligible = (
      await Promise.all([
        userJobsByStatus(ctx, userId, "new"),
        userJobsByStatus(ctx, userId, "wishlist"),
      ])
    )
      .flat()
      .filter((j) => j.matchScore === undefined || j.matchScore === null);
    const scorable = eligible
      .filter((j) => (j.jdChars ?? 0) >= minJdChars)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const skippedThinJd = eligible.length - scorable.length;
    const rows = scorable.slice(0, limit).map((j) => ({
      id: j._id,
      title: j.title,
      location: j.location ?? null,
      companyName: nameById.get(String(j.companyId)) ?? "",
    }));
    return { rows, total: scorable.length, skippedThinJd };
  },
});

// Which of the supplied dedupe keys already exist (import de-dup). Bounded by
// the number of candidate keys, using the per-user dedupe index.
export const existingDedupeKeys = query({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const userId = await requireUser(ctx);
    const found: string[] = [];
    for (const k of keys) {
      const row = await ctx.db
        .query("jobs")
        .withIndex("by_user_dedupe", (q) => q.eq("userId", userId).eq("dedupeKey", k))
        .first();
      if (row) found.push(k);
    }
    return found;
  },
});

// Compact, capped job list for the MCP `list_jobs` tool.
export const briefList = query({
  args: {
    status: v.union(v.string(), v.null()),
    roleType: v.union(v.string(), v.null()),
    minScore: v.union(v.number(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx);
    const nameById = await companyNames(ctx, userId);
    const base = a.status
      ? await userJobsByStatus(ctx, userId, a.status)
      : await userJobs(ctx, userId);
    const rows = base
      .filter((j) => (a.roleType ? j.roleType === a.roleType : true))
      .filter((j) => (a.minScore !== null ? (j.matchScore ?? -1) >= a.minScore : true))
      .sort((x, y) => (y.matchScore ?? -1) - (x.matchScore ?? -1))
      .slice(0, Math.min(a.limit, 100))
      .map((j) => ({
        id: j._id,
        title: j.title,
        company: nameById.get(String(j.companyId)) ?? "",
        status: j.status,
        roleType: j.roleType ?? null,
        score: j.matchScore ?? null,
        location: j.location ?? null,
      }));
    return rows;
  },
});

// Single job + its company name (scoring, outreach/tailor/research/resume gen).
export const getWithCompany = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const job = owned(await ctx.db.get(id), userId);
    if (!job || isPastRetention(job)) return null;
    const company = await ctx.db.get(job.companyId);
    return {
      ...job,
      id: job._id,
      description: await readDescription(ctx, job._id),
      companyName: company?.name ?? "",
      companyDomain: company?.domain ?? null,
    };
  },
});

// Newest saved jobs with a non-empty JD — prefills the Resume Match textarea.
export const savedForMatch = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const userId = await requireUser(ctx);
    const jobs = (await userJobs(ctx, userId)).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const out: {
      id: Id<"jobs">;
      title: string;
      companyName: string;
      description: string;
    }[] = [];
    for (const j of jobs) {
      if (out.length >= limit) break;
      const description = await readDescription(ctx, j._id);
      if (!description) continue;
      const company = await ctx.db.get(j.companyId);
      out.push({
        id: j._id,
        title: j.title,
        companyName: company?.name ?? "",
        description,
      });
    }
    return out;
  },
});

// Job detail page: job + company, applications, stage events, contacts.
export const detail = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const job = owned(await ctx.db.get(id), userId);
    if (!job || isPastRetention(job)) return null;
    const company = await ctx.db.get(job.companyId);
    const application = await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .unique();
    const events = await ctx.db
      .query("stageEvents")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .collect();
    const contacts = company
      ? await ctx.db
          .query("contacts")
          .withIndex("by_company", (q) => q.eq("companyId", company._id))
          .collect()
      : [];
    return {
      job: { ...job, id: job._id, description: await readDescription(ctx, job._id) },
      company: company ? { ...company, id: company._id } : null,
      application: application ? { ...application, id: application._id } : null,
      events: events.map((e) => ({ ...e, id: e._id })),
      contacts: contacts.map((c) => ({ ...c, id: c._id })),
    };
  },
});

const asRow = (job: any, companyName: string, headcount?: number) => ({
  id: job._id,
  title: job.title,
  roleType: job.roleType ?? null,
  level: job.level ?? null,
  location: job.location ?? null,
  workplaceType: job.workplaceType ?? null,
  salaryMin: job.salaryMin ?? null,
  salaryMax: job.salaryMax ?? null,
  salaryCurrency: job.salaryCurrency ?? null,
  matchScore: job.matchScore ?? null,
  postedAt: job.postedAt ?? null,
  companyName,
  headcount: headcount ?? null,
});

// Feed page: filter + sort + paginate. Narrow by user+status via index, then
// apply remaining predicates in JS (mirrors the old dynamic WHERE builder).
export const feed = query({
  args: {
    status: v.string(),
    roleTypes: v.array(v.string()),
    roleUntyped: v.boolean(),
    workplace: v.array(v.string()),
    employment: v.array(v.string()),
    q: v.string(),
    locs: v.array(v.string()),
    minSalary: v.union(v.number(), v.null()),
    postedCutoff: v.union(v.string(), v.null()),
    minScore: v.union(v.number(), v.null()),
    levels: v.array(v.string()),
    sizes: v.array(v.string()),
    sort: v.string(),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx);
    const base = await userJobsByStatus(ctx, userId, a.status);

    const ql = a.q.trim().toLowerCase();
    // Company lookups now need headcount as well as the name, so the cache
    // holds the pair — the feed can page over thousands of jobs and re-reading
    // a company per row would blow the query's read budget.
    const companyCache = new Map<
      string,
      { name: string; headcount: number | undefined }
    >();
    const companyOf = async (
      companyId: Id<"companies">,
    ): Promise<{ name: string; headcount: number | undefined }> => {
      const key = String(companyId);
      const hit = companyCache.get(key);
      if (hit) return hit;
      const c = await ctx.db.get(companyId);
      const entry = { name: c?.name ?? "", headcount: c?.headcount };
      companyCache.set(key, entry);
      return entry;
    };

    const filtered: { job: any; companyName: string; headcount?: number }[] = [];
    for (const job of base) {
      if (!(job.isUs === undefined || job.isUs === null || job.isUs === true)) continue;
      if (a.roleTypes.length > 0 || a.roleUntyped) {
        const roleOk =
          (a.roleTypes.length > 0 && job.roleType && a.roleTypes.includes(job.roleType)) ||
          (a.roleUntyped && (job.roleType === undefined || job.roleType === null));
        if (!roleOk) continue;
      }
      if (a.workplace.length > 0 && !(job.workplaceType && a.workplace.includes(job.workplaceType))) continue;
      if (a.employment.length > 0 && !(job.employmentType && a.employment.includes(job.employmentType))) continue;
      if (a.minSalary !== null) {
        const sal = job.salaryMax ?? job.salaryMin ?? null;
        if (sal === null || sal < a.minSalary) continue;
      }
      if (a.postedCutoff !== null) {
        const when = job.postedAt ?? job.createdAt;
        if (when < a.postedCutoff) continue;
      }
      if (a.minScore !== null) {
        if (job.matchScore === undefined || job.matchScore === null || job.matchScore < a.minScore) continue;
      }
      // Seniority: a job with no parsed level (pre-backfill row) is never
      // hidden — silently dropping unlabelled rows would look like data loss.
      if (a.levels.length > 0 && job.level && !a.levels.includes(job.level)) continue;

      const company = await companyOf(job.companyId);
      const companyName = company.name;
      // Same rule for size: companies not yet enriched have no band and stay
      // visible, so an unenriched workspace doesn't render an empty feed.
      if (a.sizes.length > 0) {
        const band = bandOf(company.headcount);
        if (band !== null && !a.sizes.includes(band)) continue;
      }
      if (ql) {
        const inTitle = job.title.toLowerCase().includes(ql);
        const inCompany = companyName.toLowerCase().includes(ql);
        if (!inTitle && !inCompany) continue;
      }
      if (a.locs.length > 0) {
        const loc = (job.location ?? "").toLowerCase();
        if (!a.locs.some((l) => loc.includes(l.toLowerCase()))) continue;
      }
      filtered.push({ job, companyName, headcount: company.headcount });
    }

    // Onboarding role-type picks break ties among unscored jobs in the
    // default "best" sort — scored jobs already reflect the user's profile.
    const prefs = await getOnboardingPrefs(ctx, userId);
    const preferredRoles = new Set(prefs?.roleTypes ?? []);

    const posted = (j: any) => j.postedAt ?? j.createdAt;
    filtered.sort((x, y) => {
      if (a.sort === "newest") return posted(y.job).localeCompare(posted(x.job));
      if (a.sort === "salary") {
        const sx = x.job.salaryMax ?? null;
        const sy = y.job.salaryMax ?? null;
        if (sx === null && sy === null) return y.job.createdAt.localeCompare(x.job.createdAt);
        if (sx === null) return 1;
        if (sy === null) return -1;
        if (sy !== sx) return sy - sx;
        return y.job.createdAt.localeCompare(x.job.createdAt);
      }
      // "best"/"score": matchScore desc nulls last, then preferred role
      // types among the unscored, then createdAt desc
      const mx = x.job.matchScore ?? null;
      const my = y.job.matchScore ?? null;
      if (mx === null && my === null) {
        const px = preferredRoles.has(x.job.roleType ?? "") ? 1 : 0;
        const py = preferredRoles.has(y.job.roleType ?? "") ? 1 : 0;
        if (px !== py) return py - px;
        return y.job.createdAt.localeCompare(x.job.createdAt);
      }
      if (mx === null) return 1;
      if (my === null) return -1;
      if (my !== mx) return my - mx;
      return y.job.createdAt.localeCompare(x.job.createdAt);
    });

    const total = filtered.length;
    const start = (a.page - 1) * a.pageSize;
    const rows = filtered
      .slice(start, start + a.pageSize)
      .map((f) => asRow(f.job, f.companyName, f.headcount));
    return { rows, total };
  },
});

// Newly-pulled jobs (by id) still missing a roleType — the batched classify
// step in the pull core reads this then patches each with a model guess.
export const untaggedAmong = query({
  args: { ids: v.array(v.id("jobs")), limit: v.number() },
  handler: async (ctx, { ids, limit }) => {
    const userId = await requireUser(ctx);
    const out: { id: string; title: string }[] = [];
    for (const id of ids) {
      if (out.length >= limit) break;
      const job = owned(await ctx.db.get(id), userId);
      if (job && (job.roleType === undefined || job.roleType === null)) {
        out.push({ id: job._id, title: job.title });
      }
    }
    return out;
  },
});

// Distinct raw location strings for the feed dropdown (US/unknown only).
export const locationValues = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const jobs = await userJobs(ctx, userId);
    const set = new Set<string>();
    for (const j of jobs) {
      if (j.isUs === false) continue;
      if (j.location) set.add(j.location);
    }
    return [...set];
  },
});

// Count of scorable jobs (new/wishlist, unscored, with a long-enough JD).
export const scorableCount = query({
  args: { minJdChars: v.number() },
  handler: async (ctx, { minJdChars }) => {
    const userId = await requireUser(ctx);
    const jobs = await userJobs(ctx, userId);
    return jobs.filter(
      (j) =>
        (j.matchScore === undefined || j.matchScore === null) &&
        (j.status === "new" || j.status === "wishlist") &&
        (j.jdChars ?? 0) >= minJdChars,
    ).length;
  },
});

// Scores that predate a profile edit (stale-score banner).
export const staleScoreCount = query({
  args: { profileUpdatedAt: v.union(v.string(), v.null()) },
  handler: async (ctx, { profileUpdatedAt }) => {
    if (!profileUpdatedAt) return 0;
    const userId = await requireUser(ctx);
    const jobs = await userJobs(ctx, userId);
    return jobs.filter(
      (j) => j.scoredAt !== undefined && j.scoredAt !== null && j.scoredAt < profileUpdatedAt,
    ).length;
  },
});

// ---- writes ------------------------------------------------------------

// Per-user dedupe lookup for inserts — returns the existing id when present.
async function findDedupeHit(
  ctx: QueryCtx,
  userId: Id<"users">,
  doc: { dedupeKey: string; source?: string; externalId?: string },
): Promise<Id<"jobs"> | null> {
  const byKey = await ctx.db
    .query("jobs")
    .withIndex("by_user_dedupe", (q) => q.eq("userId", userId).eq("dedupeKey", doc.dedupeKey))
    .unique();
  if (byKey) return byKey._id;
  if (doc.externalId) {
    const byExt = await ctx.db
      .query("jobs")
      .withIndex("by_user_source_external", (q) =>
        q.eq("userId", userId).eq("source", doc.source!).eq("externalId", doc.externalId),
      )
      .unique();
    if (byExt) return byExt._id;
  }
  return null;
}

// Dedupe-aware single insert (manual entry + import bridges). Mirrors
// createJobCore's DB side; the caller supplies the fully-derived doc.
export const createOne = mutation({
  args: {
    doc: v.any(),
    initialStatus: v.string(),
    submittedAt: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { doc, initialStatus, submittedAt }) => {
    const userId = await requireUser(ctx);
    const existingId = await findDedupeHit(ctx, userId, doc);
    if (existingId) return { inserted: false as const, jobId: existingId };
    const jobDoc: Record<string, unknown> = { ...(doc as Record<string, unknown>), userId };
    // Never admit listings already past the portal-wide age ceiling.
    if (
      isPastRetention({
        postedAt: typeof jobDoc.postedAt === "string" ? jobDoc.postedAt : null,
        createdAt:
          typeof jobDoc.createdAt === "string"
            ? jobDoc.createdAt
            : new Date().toISOString(),
      })
    ) {
      return { inserted: false as const, jobId: null };
    }
    const text = typeof jobDoc.description === "string" ? jobDoc.description : "";
    delete jobDoc.description;
    jobDoc.jdChars = text.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobId = await ctx.db.insert("jobs", jobDoc as any);
    if (text) await writeDescription(ctx, jobId, text);
    const now = doc.createdAt as string;
    if (initialStatus !== "new") {
      await ctx.db.insert("stageEvents", { userId, jobId, toStatus: initialStatus, at: now });
    }
    if (submittedAt) {
      await ctx.db.insert("applications", {
        userId,
        jobId,
        submittedAt,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { inserted: true as const, jobId };
  },
});

// Bulk dedupe-aware insert for the ATS/aggregator pull. Returns inserted ids.
export const upsertBatch = mutation({
  args: { docs: v.array(v.any()) },
  handler: async (ctx, { docs }) => {
    const userId = await requireUser(ctx);
    const insertedIds: string[] = [];
    let added = 0;
    for (const doc of docs) {
      if (await findDedupeHit(ctx, userId, doc)) continue;
      const jobDoc: Record<string, unknown> = { ...(doc as Record<string, unknown>), userId };
      if (
        isPastRetention({
          postedAt: typeof jobDoc.postedAt === "string" ? jobDoc.postedAt : null,
          createdAt:
            typeof jobDoc.createdAt === "string"
              ? jobDoc.createdAt
              : new Date().toISOString(),
        })
      ) {
        continue;
      }
      const text = typeof jobDoc.description === "string" ? jobDoc.description : "";
      delete jobDoc.description;
      jobDoc.jdChars = text.length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = await ctx.db.insert("jobs", jobDoc as any);
      if (text) await writeDescription(ctx, id, text);
      insertedIds.push(id);
      added++;
    }
    return { added, insertedIds };
  },
});

export const patch = mutation({
  args: { id: v.id("jobs"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUser(ctx);
    const job = owned(await ctx.db.get(id), userId);
    if (!job) throw new Error("Job not found");
    // `description` isn't a column on jobs — route it to the side table and
    // keep the cached length in sync.
    if (Object.prototype.hasOwnProperty.call(patch, "description")) {
      const rest = { ...(patch as Record<string, unknown>) };
      const text = typeof rest.description === "string" ? rest.description : "";
      delete rest.description;
      rest.jdChars = text.length;
      await writeDescription(ctx, id, text);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.db.patch(id, rest as any);
      return;
    }
    await ctx.db.patch(id, patch);
  },
});

// Status transition: patch status + append stage event + ensure application.
export const setStatus = mutation({
  args: { id: v.id("jobs"), to: v.string() },
  handler: async (ctx, { id, to }) => {
    const userId = await requireUser(ctx);
    const job = owned(await ctx.db.get(id), userId);
    if (!job) return { ok: false as const, error: "Job not found" };
    if (job.status === to) return { ok: true as const };
    const now = new Date().toISOString();
    await ctx.db.patch(id, { status: to, updatedAt: now });
    await ctx.db.insert("stageEvents", {
      userId,
      jobId: id,
      fromStatus: job.status,
      toStatus: to,
      at: now,
    });
    if (to === "applied") {
      const existing = await ctx.db
        .query("applications")
        .withIndex("by_job", (q) => q.eq("jobId", id))
        .unique();
      if (!existing) {
        await ctx.db.insert("applications", {
          userId,
          jobId: id,
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return { ok: true as const };
  },
});

async function deleteOwnedJobCascade(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"jobs">,
): Promise<boolean> {
  const job = owned(await ctx.db.get(id), userId);
  if (!job) return false;
  const kids = [
    await ctx.db.query("stageEvents").withIndex("by_job", (q) => q.eq("jobId", id)).collect(),
    await ctx.db.query("applications").withIndex("by_job", (q) => q.eq("jobId", id)).collect(),
    await ctx.db.query("outreach").withIndex("by_job", (q) => q.eq("jobId", id)).collect(),
    await ctx.db.query("researchBriefs").withIndex("by_job", (q) => q.eq("jobId", id)).collect(),
    await ctx.db.query("generatedResumes").withIndex("by_job", (q) => q.eq("jobId", id)).collect(),
    await ctx.db.query("jobDescriptions").withIndex("by_job", (q) => q.eq("jobId", id)).collect(),
  ];
  for (const group of kids)
    for (const row of group) {
      if ("pdfFileId" in row && row.pdfFileId) await ctx.storage.delete(row.pdfFileId);
      await ctx.db.delete(row._id);
    }
  const queue = await ctx.db
    .query("applyQueue")
    .withIndex("by_user_job", (q) => q.eq("userId", userId).eq("jobId", id))
    .collect();
  for (const row of queue) await ctx.db.delete(row._id);
  await ctx.db.delete(id);
  return true;
}

// Full cascade delete (fixes the old gap: also removes briefs + resumes).
export const deleteCascade = mutation({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    await deleteOwnedJobCascade(ctx, userId, id);
  },
});

// Page-scoped bulk delete. The action calls this in small chunks so related
// rows and stored resume PDFs stay within one bounded mutation.
export const deleteManyCascade = mutation({
  args: { ids: v.array(v.id("jobs")) },
  handler: async (ctx, { ids }) => {
    if (ids.length > 10) throw new Error("Delete at most 10 jobs per batch.");
    const userId = await requireUser(ctx);
    let deleted = 0;
    for (const id of [...new Set(ids)]) {
      if (await deleteOwnedJobCascade(ctx, userId, id)) deleted++;
    }
    return { deleted };
  },
});

// Maintenance: wipe the signed-in user's jobs + side rows in bounded batches.
// Call repeatedly until it returns { done: true }.
export const wipeAllBatch = mutation({
  args: { batch: v.number() },
  handler: async (ctx, { batch }) => {
    const userId = await requireUser(ctx);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(batch);
    for (const j of jobs) {
      await deleteOwnedJobCascade(ctx, userId, j._id);
    }
    return { deleted: jobs.length, done: jobs.length < batch };
  },
});
