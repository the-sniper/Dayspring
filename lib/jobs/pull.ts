// Next-free pull core — shared by the UI server action and the CLI script
// (scripts/pull-jobs.ts, the future cron entry). Nothing in this import
// chain may touch next/* APIs.
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { hasApiKey } from "@/lib/claude/client";
import { classifyRoles, CLASSIFY_BATCH_LIMIT } from "@/lib/claude/classify-roles";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
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

// Resolve the right fetcher per company: bare-slug ATSes use the registry;
// Workday needs its three-value locator.
function fetchForCompany(c: typeof companies.$inferSelect): Promise<NormalizedJob[]> {
  if (c.atsType === "workday") {
    if (!c.atsTenant || !c.atsHost || !c.atsSite) {
      return Promise.reject(new Error(`workday/${c.name}: missing tenant/host/site`));
    }
    return fetchWorkday({ tenant: c.atsTenant, host: c.atsHost, site: c.atsSite });
  }
  return adapters[c.atsType!](c.atsSlug!);
}

export type PullResult = {
  perCompany: { name: string; fetched: number; added: number; skipped: number }[];
  errors: { name: string; message: string }[];
  newJobIds: number[];
  classified: number;
};

export async function pullAllJobs(): Promise<PullResult> {
  // Watched = a bare-slug ATS with a slug, OR Workday with all three fields.
  const watched = db
    .select()
    .from(companies)
    .where(
      and(
        isNotNull(companies.atsType),
        or(
          isNotNull(companies.atsSlug),
          and(
            eq(companies.atsType, "workday"),
            isNotNull(companies.atsTenant),
            isNotNull(companies.atsHost),
            isNotNull(companies.atsSite),
          ),
        ),
      ),
    )
    .all();

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
  settled.forEach((s, i) => {
    if (s.status === "rejected") {
      result.errors.push({
        name: watched[i].name,
        message: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
      return;
    }
    const { company, fetched } = s.value;
    let added = 0;
    let skipped = 0;
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
      const res = db
        .insert(jobs)
        .values({
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
        })
        .onConflictDoNothing()
        .run();
      if (res.changes > 0) {
        added++;
        result.newJobIds.push(Number(res.lastInsertRowid));
      }
    }
    result.perCompany.push({
      name: company.name,
      fetched: fetched.length,
      added,
      skipped,
    });
  });

  // Aggregator source (Adzuna) — broad cross-industry US coverage for the long
  // tail not on a watched ATS board. Env-guarded; each posting is resolved to a
  // company row on the fly, then flows through the same derive → US-filter →
  // dedupe insert as ATS jobs. Reported as one summary row.
  if (hasAdzunaKeys()) {
    try {
      const aggregated = await fetchAdzuna();
      let added = 0;
      let skipped = 0;
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
        const companyId = findOrCreateCompany(aj.companyName);
        const res = db
          .insert(jobs)
          .values({
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
          })
          .onConflictDoNothing()
          .run();
        if (res.changes > 0) {
          added++;
          result.newJobIds.push(Number(res.lastInsertRowid));
        }
      }
      result.perCompany.push({
        name: "Adzuna (aggregator)",
        fetched: aggregated.length,
        added,
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
  if (hasApiKey() && result.newJobIds.length > 0) {
    try {
      const untagged = db
        .select({ id: jobs.id, title: jobs.title })
        .from(jobs)
        .where(and(inArray(jobs.id, result.newJobIds), isNull(jobs.roleType)))
        .limit(CLASSIFY_BATCH_LIMIT)
        .all();
      if (untagged.length > 0) {
        const roles = await classifyRoles(untagged.map((j) => j.title));
        untagged.forEach((j, i) => {
          if (roles[i]) {
            db.update(jobs)
              .set({ roleType: roles[i] })
              .where(inArray(jobs.id, [j.id]))
              .run();
            result.classified++;
          }
        });
      }
    } catch {
      // leave nulls
    }
  }

  return result;
}
