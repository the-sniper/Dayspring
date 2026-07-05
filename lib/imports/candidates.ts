import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
import { createJobCore } from "@/lib/jobs/create";
import { dedupeKey } from "@/lib/jobs/dedupe";
import type { CandidateJob, JobSource } from "@/lib/types";

export type PreparedCandidate = CandidateJob & { duplicate: boolean };

// Flags candidates whose (company, title, url) already exists — the preview
// default-unchecks these. A candidate whose company isn't in the DB yet can't
// be a duplicate.
export function flagDuplicates(candidates: CandidateJob[]): PreparedCandidate[] {
  return candidates.map((c) => {
    const clean = c.company.trim().replace(/\s+/g, " ");
    const company = db
      .select({ id: companies.id })
      .from(companies)
      .where(sql`lower(${companies.name}) = ${clean.toLowerCase()}`)
      .get();
    if (!company) return { ...c, duplicate: false };
    const key = dedupeKey(company.id, c.title, c.url?.trim() || null);
    const existing = db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.dedupeKey, key))
      .get();
    return { ...c, duplicate: !!existing };
  });
}

// Shared insert path for both bridges. Rows carrying an applied-or-later
// status plus a date get their application row backdated by createJobCore.
export function confirmImport(
  candidates: CandidateJob[],
  source: JobSource,
): { inserted: number; skipped: number } {
  let inserted = 0;
  let skipped = 0;
  for (const c of candidates) {
    const res = createJobCore({
      companyName: c.company,
      title: c.title,
      url: c.url,
      location: c.location,
      roleType: c.roleType ?? null,
      description: c.description,
      source,
      status: c.status ?? "new",
      submittedDate:
        c.date && c.status && c.status !== "new" && c.status !== "ignored" && c.status !== "wishlist"
          ? c.date
          : null,
      postedAt: null,
    });
    if (res.inserted) inserted++;
    else skipped++;
  }
  return { inserted, skipped };
}
