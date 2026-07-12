import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// The JD text lives in the `jobDescriptions` side table (see schema). These
// helpers read/write it by jobId so the rest of the app can keep treating
// `description` as if it were a column on the job.
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

// ---- reads -------------------------------------------------------------

export const getById = query({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

// Full job list joined with company name — used by dashboard/board/match/
// digest/scoring which all scan the whole table anyway.
export const listAllWithCompany = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").collect();
    const companies = await ctx.db.query("companies").collect();
    const nameById = new Map(companies.map((c) => [String(c._id), c.name]));
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
  handler: async (ctx, { id }) => await readDescription(ctx, id),
});

// Per-status row counts (dashboard funnel + digest). Reads all job rows (small
// now) but returns just a compact map, so it's safe past the 8192 return cap.
export const statusCounts = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").collect();
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
    const companies = await ctx.db.query("companies").collect();
    const nameById = new Map(companies.map((c) => [String(c._id), c.name]));
    const groups = await Promise.all(
      statuses.map((status) =>
        ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", status)).collect(),
      ),
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
    const companies = await ctx.db.query("companies").collect();
    const nameById = new Map(companies.map((c) => [String(c._id), c.name]));
    const rows = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "new"))
      .collect();
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
    const companies = await ctx.db.query("companies").collect();
    const nameById = new Map(companies.map((c) => [String(c._id), c.name]));
    const eligible = (
      await Promise.all([
        ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "new")).collect(),
        ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", "wishlist")).collect(),
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
// the number of candidate keys, using the by_dedupe_key index.
export const existingDedupeKeys = query({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const found: string[] = [];
    for (const k of keys) {
      const row = await ctx.db
        .query("jobs")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", k))
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
    const companies = await ctx.db.query("companies").collect();
    const nameById = new Map(companies.map((c) => [String(c._id), c.name]));
    const base = a.status
      ? await ctx.db.query("jobs").withIndex("by_status", (q) => q.eq("status", a.status!)).collect()
      : await ctx.db.query("jobs").collect();
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
    const job = await ctx.db.get(id);
    if (!job) return null;
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
// Job rows are small now, so the scan is cheap; only the (bounded) descriptions
// we actually return get read.
export const savedForMatch = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const jobs = (await ctx.db.query("jobs").collect()).sort((a, b) =>
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
    const job = await ctx.db.get(id);
    if (!job) return null;
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

const asRow = (job: any, companyName: string) => ({
  id: job._id,
  title: job.title,
  roleType: job.roleType ?? null,
  location: job.location ?? null,
  workplaceType: job.workplaceType ?? null,
  salaryMin: job.salaryMin ?? null,
  salaryMax: job.salaryMax ?? null,
  salaryCurrency: job.salaryCurrency ?? null,
  matchScore: job.matchScore ?? null,
  postedAt: job.postedAt ?? null,
  companyName,
});

// Feed page: filter + sort + paginate. Narrow by status via index, then apply
// remaining predicates in JS (mirrors the old dynamic WHERE builder).
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
    sort: v.string(),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, a) => {
    const base = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", a.status))
      .collect();

    const ql = a.q.trim().toLowerCase();
    const companyCache = new Map<string, string>();
    const nameOf = async (companyId: Id<"companies">): Promise<string> => {
      const key = String(companyId);
      if (companyCache.has(key)) return companyCache.get(key)!;
      const c = await ctx.db.get(companyId);
      const name = c?.name ?? "";
      companyCache.set(key, name);
      return name;
    };

    const filtered: { job: any; companyName: string }[] = [];
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
      const companyName = await nameOf(job.companyId);
      if (ql) {
        const inTitle = job.title.toLowerCase().includes(ql);
        const inCompany = companyName.toLowerCase().includes(ql);
        if (!inTitle && !inCompany) continue;
      }
      if (a.locs.length > 0) {
        const loc = (job.location ?? "").toLowerCase();
        if (!a.locs.some((l) => loc.includes(l.toLowerCase()))) continue;
      }
      filtered.push({ job, companyName });
    }

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
      // "best"/"score": matchScore desc nulls last, then createdAt desc
      const mx = x.job.matchScore ?? null;
      const my = y.job.matchScore ?? null;
      if (mx === null && my === null) return y.job.createdAt.localeCompare(x.job.createdAt);
      if (mx === null) return 1;
      if (my === null) return -1;
      if (my !== mx) return my - mx;
      return y.job.createdAt.localeCompare(x.job.createdAt);
    });

    const total = filtered.length;
    const start = (a.page - 1) * a.pageSize;
    const rows = filtered.slice(start, start + a.pageSize).map((f) => asRow(f.job, f.companyName));
    return { rows, total };
  },
});

// Newly-pulled jobs (by id) still missing a roleType — the batched classify
// step in the pull core reads this then patches each with a model guess.
export const untaggedAmong = query({
  args: { ids: v.array(v.id("jobs")), limit: v.number() },
  handler: async (ctx, { ids, limit }) => {
    const out: { id: string; title: string }[] = [];
    for (const id of ids) {
      if (out.length >= limit) break;
      const job = await ctx.db.get(id);
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
    const jobs = await ctx.db.query("jobs").collect();
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
    const jobs = await ctx.db.query("jobs").collect();
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
    const jobs = await ctx.db.query("jobs").collect();
    return jobs.filter(
      (j) => j.scoredAt !== undefined && j.scoredAt !== null && j.scoredAt < profileUpdatedAt,
    ).length;
  },
});

// ---- writes ------------------------------------------------------------

// Dedupe-aware single insert (manual entry + import bridges). Mirrors
// createJobCore's DB side; the caller supplies the fully-derived doc.
export const createOne = mutation({
  args: {
    doc: v.any(),
    initialStatus: v.string(),
    submittedAt: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { doc, initialStatus, submittedAt }) => {
    const byKey = await ctx.db
      .query("jobs")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", doc.dedupeKey))
      .unique();
    if (byKey) return { inserted: false as const };
    if (doc.externalId) {
      const byExt = await ctx.db
        .query("jobs")
        .withIndex("by_source_external_id", (q) =>
          q.eq("source", doc.source).eq("externalId", doc.externalId),
        )
        .unique();
      if (byExt) return { inserted: false as const };
    }
    const jobDoc = { ...(doc as Record<string, unknown>) };
    const text = typeof jobDoc.description === "string" ? jobDoc.description : "";
    delete jobDoc.description;
    jobDoc.jdChars = text.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobId = await ctx.db.insert("jobs", jobDoc as any);
    if (text) await writeDescription(ctx, jobId, text);
    const now = doc.createdAt as string;
    if (initialStatus !== "new") {
      await ctx.db.insert("stageEvents", { jobId, toStatus: initialStatus, at: now });
    }
    if (submittedAt) {
      await ctx.db.insert("applications", {
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
    const insertedIds: string[] = [];
    let added = 0;
    for (const doc of docs) {
      const byKey = await ctx.db
        .query("jobs")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", doc.dedupeKey))
        .unique();
      if (byKey) continue;
      if (doc.externalId) {
        const byExt = await ctx.db
          .query("jobs")
          .withIndex("by_source_external_id", (q) =>
            q.eq("source", doc.source).eq("externalId", doc.externalId),
          )
          .unique();
        if (byExt) continue;
      }
      const jobDoc = { ...(doc as Record<string, unknown>) };
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
    const job = await ctx.db.get(id);
    if (!job) return { ok: false as const, error: "Job not found" };
    if (job.status === to) return { ok: true as const };
    const now = new Date().toISOString();
    await ctx.db.patch(id, { status: to, updatedAt: now });
    await ctx.db.insert("stageEvents", {
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

// Full cascade delete (fixes the old gap: also removes briefs + resumes).
export const deleteCascade = mutation({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
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
    await ctx.db.delete(id);
  },
});

// Maintenance: wipe all jobs + their side rows in bounded batches. Used once to
// clear pre–side-table rows so a fresh pull repopulates small job docs. Call
// repeatedly until it returns { done: true }.
export const wipeAllBatch = mutation({
  args: { batch: v.number() },
  handler: async (ctx, { batch }) => {
    const jobs = await ctx.db.query("jobs").take(batch);
    for (const j of jobs) {
      const kids = [
        await ctx.db.query("stageEvents").withIndex("by_job", (q) => q.eq("jobId", j._id)).collect(),
        await ctx.db.query("applications").withIndex("by_job", (q) => q.eq("jobId", j._id)).collect(),
        await ctx.db.query("outreach").withIndex("by_job", (q) => q.eq("jobId", j._id)).collect(),
        await ctx.db.query("researchBriefs").withIndex("by_job", (q) => q.eq("jobId", j._id)).collect(),
        await ctx.db.query("generatedResumes").withIndex("by_job", (q) => q.eq("jobId", j._id)).collect(),
        await ctx.db.query("jobDescriptions").withIndex("by_job", (q) => q.eq("jobId", j._id)).collect(),
      ];
      for (const group of kids)
        for (const row of group) {
          if ("pdfFileId" in row && row.pdfFileId) await ctx.storage.delete(row.pdfFileId);
          await ctx.db.delete(row._id);
        }
      await ctx.db.delete(j._id);
    }
    return { deleted: jobs.length, done: jobs.length < batch };
  },
});
