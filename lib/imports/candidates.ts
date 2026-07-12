import { api, convex } from "@/lib/convex/server";
import { createJobCore } from "@/lib/jobs/create";
import { dedupeKey } from "@/lib/jobs/dedupe";
import type { CandidateJob, JobSource } from "@/lib/types";

export type PreparedCandidate = CandidateJob & { duplicate: boolean };

// Flags candidates whose (company, title, url) already exists — the preview
// default-unchecks these. A candidate whose company isn't in the DB yet can't
// be a duplicate.
export async function flagDuplicates(candidates: CandidateJob[]): Promise<PreparedCandidate[]> {
  const allCompanies = await convex().query(api.companies.listAll, {});
  const companyByName = new Map(
    allCompanies.map((c) => [c.name.trim().replace(/\s+/g, " ").toLowerCase(), c.id]),
  );
  // Compute each candidate's dedupe key (only for companies we already track),
  // then ask Convex which of those keys already exist — bounded by candidate
  // count instead of scanning the whole jobs table.
  const keyByIndex = candidates.map((c) => {
    const companyId = companyByName.get(c.company.trim().replace(/\s+/g, " ").toLowerCase());
    return companyId ? dedupeKey(companyId, c.title, c.url?.trim() || null) : null;
  });
  const keys = [...new Set(keyByIndex.filter((k): k is string => k !== null))];
  const existing = new Set(
    keys.length
      ? await convex().query(api.jobs.existingDedupeKeys, { keys })
      : [],
  );
  return candidates.map((c, i) => {
    const key = keyByIndex[i];
    return { ...c, duplicate: key !== null && existing.has(key) };
  });
}

// Shared insert path for both bridges. Rows carrying an applied-or-later
// status plus a date get their application row backdated by createJobCore.
export async function confirmImport(
  candidates: CandidateJob[],
  source: JobSource,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const c of candidates) {
    const res = await createJobCore({
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
