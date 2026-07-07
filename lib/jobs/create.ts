import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, companies, jobs, stageEvents } from "@/lib/db/schema";
import { dedupeKey } from "@/lib/jobs/dedupe";
import { deriveJobMeta } from "@/lib/jobs/derive";
import { heuristicRoleType } from "@/lib/jobs/role-type";
import type { JobSource, JobStatus, RoleType } from "@/lib/types";

export function findOrCreateCompany(name: string): number {
  const clean = name.trim().replace(/\s+/g, " ");
  const existing = db
    .select({ id: companies.id })
    .from(companies)
    .where(sql`lower(${companies.name}) = ${clean.toLowerCase()}`)
    .get();
  if (existing) return existing.id;
  const res = db
    .insert(companies)
    .values({ name: clean, createdAt: new Date().toISOString() })
    .run();
  return Number(res.lastInsertRowid);
}

export type NewJobInput = {
  companyName: string;
  title: string;
  url?: string | null;
  location?: string | null;
  roleType?: RoleType | null;
  description?: string;
  source: JobSource;
  externalId?: string | null;
  status?: JobStatus;
  postedAt?: string | null;
  // For imports of already-submitted applications: backdates submittedAt.
  submittedDate?: string | null;
};

// Shared insert core for manual entry and the import bridges (the ATS pull
// has its own bulk path). Dedupe-aware: returns inserted=false on conflict.
export function createJobCore(
  input: NewJobInput,
): { inserted: true; jobId: number } | { inserted: false } {
  const companyId = findOrCreateCompany(input.companyName);
  const title = input.title.trim();
  const url = input.url?.trim() || null;
  const status = input.status ?? "new";
  const location = input.location?.trim() || null;
  const description = input.description ?? "";
  const now = new Date().toISOString();

  // Manual/imported rows are trusted (user chose to add them), so we derive
  // and store the filterable metadata but never drop non-US here.
  const meta = deriveJobMeta({ title, location, description });

  const res = db
    .insert(jobs)
    .values({
      companyId,
      title,
      roleType: input.roleType ?? heuristicRoleType(title),
      url,
      source: input.source,
      externalId: input.externalId ?? null,
      dedupeKey: dedupeKey(companyId, title, url),
      status,
      location,
      isUs: meta.isUs,
      workplaceType: meta.workplaceType,
      employmentType: meta.employmentType,
      salaryMin: meta.salaryMin,
      salaryMax: meta.salaryMax,
      salaryCurrency: meta.salaryCurrency,
      description,
      postedAt: input.postedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();

  if (res.changes === 0) return { inserted: false };
  const jobId = Number(res.lastInsertRowid);

  // Log human-meaningful initial states only — bulk feed rows land as `new`
  // silently so the activity list stays about decisions, not scraping.
  if (status !== "new") {
    db.insert(stageEvents)
      .values({ jobId, fromStatus: null, toStatus: status, at: now })
      .run();
  }
  const submitted = input.submittedDate ?? (status === "applied" ? now : null);
  if (submitted) {
    db.insert(applications)
      .values({
        jobId,
        submittedAt: submitted,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
  return { inserted: true, jobId };
}
