// Next-free pull core — shared by the UI server action and the CLI script
// (scripts/pull-jobs.ts, the future cron entry). Nothing in this import
// chain may touch next/* APIs.
import { hasApiKey } from "@/lib/claude/client";
import { classifyRoles, CLASSIFY_BATCH_LIMIT } from "@/lib/claude/classify-roles";
import { api, cleanDoc, convex } from "@/lib/convex/server";
import { adapters } from "@/lib/integrations/ats";
import { fetchWorkday } from "@/lib/integrations/ats/workday";
import type { NormalizedJob } from "@/lib/integrations/ats/types";
import { fetchAdzuna, hasAdzunaKeys } from "@/lib/integrations/jobs/adzuna";
import { dedupeKey } from "@/lib/jobs/dedupe";
import { deriveJobMeta } from "@/lib/jobs/derive";
import { findOrCreateCompany } from "@/lib/jobs/create";
import { heuristicRoleType } from "@/lib/jobs/role-type";
import { mapPool } from "@/lib/util/pool";

// Cap concurrent ATS requests so a large watched set (hundreds of catalog
// companies) doesn't fire hundreds of fetches at once and trip timeouts.
const ATS_CONCURRENCY = 10;

// Convex caps writes at ~4 MiB/s per (local) deployment. Job descriptions are
// large, so a single upsertBatch of a whole board/aggregator can trip the
// TooManyWrites limit. Chunk the docs and pace the calls, retrying with backoff
// if we still get rate-limited.
const UPSERT_CHUNK = 15;

async function upsertJobsThrottled(docs: unknown[]): Promise<string[]> {
  const insertedIds: string[] = [];
  for (let i = 0; i < docs.length; i += UPSERT_CHUNK) {
    const chunk = docs.slice(i, i + UPSERT_CHUNK);
    let attempt = 0;
    for (;;) {
      try {
        const { insertedIds: ids } = await convex().mutation(
          api.jobs.upsertBatch,
          { docs: chunk },
        );
        insertedIds.push(...ids);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const cause = err instanceof Error ? String(err.cause ?? "") : "";
        // Retry rate limits AND transient network failures (cloud deployments
        // occasionally drop the keep-alive socket mid-request: "fetch failed" /
        // "other side closed"). upsertBatch dedupes, so retries are safe.
        const transient =
          /TooManyWrites|Too many writes/i.test(msg) ||
          /fetch failed|other side closed|ECONNRESET|UND_ERR_SOCKET|network/i.test(msg + " " + cause);
        if (attempt < 5 && transient) {
          attempt++;
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw err;
      }
    }
    // Small pacing gap between chunks to stay under the per-second write cap.
    await new Promise((r) => setTimeout(r, 150));
  }
  return insertedIds;
}

type WatchedCompany = {
  id: string;
  name: string;
  atsType?: string | null;
  atsSlug?: string | null;
  atsTenant?: string | null;
  atsHost?: string | null;
  atsSite?: string | null;
};

// Resolve the right fetcher per company: bare-slug ATSes use the registry;
// Workday needs its three-value locator.
function fetchForCompany(c: WatchedCompany): Promise<NormalizedJob[]> {
  if (c.atsType === "workday") {
    if (!c.atsTenant || !c.atsHost || !c.atsSite) {
      return Promise.reject(new Error(`workday/${c.name}: missing tenant/host/site`));
    }
    return fetchWorkday({ tenant: c.atsTenant, host: c.atsHost, site: c.atsSite });
  }
  return adapters[c.atsType as keyof typeof adapters]!(c.atsSlug!);
}

export type PullResult = {
  perCompany: { name: string; fetched: number; added: number; skipped: number }[];
  errors: { name: string; message: string }[];
  newJobIds: string[];
  classified: number;
};

export async function pullAllJobs(): Promise<PullResult> {
  // Watched = a bare-slug ATS with a slug, OR Workday with all three fields.
  const allCompanies = await convex().query(api.companies.listAll, {});
  const watched: WatchedCompany[] = allCompanies.filter(
    (c) =>
      !!c.atsType &&
      (!!c.atsSlug ||
        (c.atsType === "workday" && !!c.atsTenant && !!c.atsHost && !!c.atsSite)),
  );

  const result: PullResult = {
    perCompany: [],
    errors: [],
    newJobIds: [],
    classified: 0,
  };

  // One bad slug (404, empty board, timeout) never kills the run. Pooled so a
  // large catalog doesn't open hundreds of sockets simultaneously.
  const settled = await mapPool(watched, ATS_CONCURRENCY, async (c) => ({
    company: c,
    fetched: await fetchForCompany(c),
  }));

  const now = new Date().toISOString();
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === "rejected") {
      result.errors.push({
        name: watched[i].name,
        message: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
      continue;
    }
    const { company, fetched } = s.value;
    let skipped = 0;
    const docs = [];
    for (const nj of fetched) {
      const meta = deriveJobMeta({
        title: nj.title,
        location: nj.location,
        description: nj.descriptionText,
      });
      // Strict US-only ingestion: drop roles whose location is confirmed
      // non-US. Unknown/remote-no-country (isUs === null) are kept.
      if (meta.isUs === false) {
        skipped++;
        continue;
      }
      docs.push(
        cleanDoc({
          companyId: company.id,
          title: nj.title,
          roleType: heuristicRoleType(nj.title),
          url: nj.url,
          source: company.atsType!,
          externalId: nj.externalId,
          dedupeKey: dedupeKey(company.id, nj.title, nj.url),
          status: "new",
          location: nj.location,
          isUs: meta.isUs,
          workplaceType: meta.workplaceType,
          employmentType: meta.employmentType,
          salaryMin: meta.salaryMin,
          salaryMax: meta.salaryMax,
          salaryCurrency: meta.salaryCurrency,
          description: nj.descriptionText,
          postedAt: nj.postedAt,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    const insertedIds = await upsertJobsThrottled(docs);
    result.newJobIds.push(...insertedIds);
    result.perCompany.push({
      name: company.name,
      fetched: fetched.length,
      added: insertedIds.length,
      skipped,
    });
  }

  // Aggregator source (Adzuna) — broad cross-industry US coverage for the long
  // tail not on a watched ATS board. Env-guarded; each posting is resolved to a
  // company row on the fly, then flows through the same derive → US-filter →
  // dedupe insert as ATS jobs. Reported as one summary row.
  if (hasAdzunaKeys()) {
    try {
      const aggregated = await fetchAdzuna();
      let skipped = 0;
      const docs = [];
      for (const aj of aggregated) {
        const meta = deriveJobMeta({
          title: aj.title,
          location: aj.location,
          description: aj.descriptionText,
        });
        if (meta.isUs === false) {
          skipped++;
          continue;
        }
        const companyId = await findOrCreateCompany(aj.companyName);
        docs.push(
          cleanDoc({
            companyId,
            title: aj.title,
            roleType: heuristicRoleType(aj.title),
            url: aj.url,
            source: "adzuna",
            externalId: aj.externalId,
            dedupeKey: dedupeKey(companyId, aj.title, aj.url),
            status: "new",
            location: aj.location,
            isUs: meta.isUs,
            workplaceType: meta.workplaceType,
            employmentType: meta.employmentType,
            // Prefer the aggregator's structured comp; fall back to mined values.
            salaryMin: aj.salaryMin ?? meta.salaryMin,
            salaryMax: aj.salaryMax ?? meta.salaryMax,
            salaryCurrency: aj.salaryMin != null || aj.salaryMax != null ? "USD" : meta.salaryCurrency,
            description: aj.descriptionText,
            postedAt: aj.postedAt,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      const insertedIds = await upsertJobsThrottled(docs);
      result.newJobIds.push(...insertedIds);
      result.perCompany.push({
        name: "Adzuna (aggregator)",
        fetched: aggregated.length,
        added: insertedIds.length,
        skipped,
      });
    } catch (err) {
      result.errors.push({
        name: "Adzuna (aggregator)",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Cheap batched classify for this run's titles the regexes missed.
  // Non-fatal: no key or a failed call just leaves roleType null (settable
  // manually on the job detail page).
  if (await hasApiKey() && result.newJobIds.length > 0) {
    try {
      const untagged = await convex().query(api.jobs.untaggedAmong, {
        ids: result.newJobIds as never,
        limit: CLASSIFY_BATCH_LIMIT,
      });
      if (untagged.length > 0) {
        const roles = await classifyRoles(untagged.map((j) => j.title));
        for (let i = 0; i < untagged.length; i++) {
          if (roles[i]) {
            await convex().mutation(api.jobs.patch, {
              id: untagged[i].id as never,
              patch: { roleType: roles[i] },
            });
            result.classified++;
          }
        }
      }
    } catch {
      // leave nulls
    }
  }

  return result;
}
