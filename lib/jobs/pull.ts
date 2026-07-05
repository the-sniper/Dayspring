// Next-free pull core — shared by the UI server action and the CLI script
// (scripts/pull-jobs.ts, the future cron entry). Nothing in this import
// chain may touch next/* APIs.
import { and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
import { adapters } from "@/lib/integrations/ats";
import { dedupeKey } from "@/lib/jobs/dedupe";
import { heuristicRoleType } from "@/lib/jobs/role-type";

export type PullResult = {
  perCompany: { name: string; fetched: number; added: number }[];
  errors: { name: string; message: string }[];
  newJobIds: number[];
};

export async function pullAllJobs(): Promise<PullResult> {
  const watched = db
    .select()
    .from(companies)
    .where(and(isNotNull(companies.atsType), isNotNull(companies.atsSlug)))
    .all();

  const result: PullResult = { perCompany: [], errors: [], newJobIds: [] };

  // One bad slug (404, empty board, timeout) never kills the run.
  const settled = await Promise.allSettled(
    watched.map(async (c) => ({
      company: c,
      fetched: await adapters[c.atsType!](c.atsSlug!),
    })),
  );

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
    for (const nj of fetched) {
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
    result.perCompany.push({ name: company.name, fetched: fetched.length, added });
  });

  return result;
}
