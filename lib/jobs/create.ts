import { api, cleanDoc, convex } from "@/lib/convex/server";
import { dedupeKey } from "@/lib/jobs/dedupe";
import { deriveJobMeta } from "@/lib/jobs/derive";
import { heuristicRoleType } from "@/lib/jobs/role-type";
import type { JobSource, JobStatus, RoleType } from "@/lib/types";

export async function findOrCreateCompany(name: string): Promise<string> {
  return await convex().mutation(api.companies.findOrCreate, { name });
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
export async function createJobCore(
  input: NewJobInput,
): Promise<{ inserted: true; jobId: string } | { inserted: false }> {
  const companyId = await findOrCreateCompany(input.companyName);
  const title = input.title.trim();
  const url = input.url?.trim() || null;
  const status = input.status ?? "new";
  const location = input.location?.trim() || null;
  const description = input.description ?? "";
  const now = new Date().toISOString();

  // Manual/imported rows are trusted (user chose to add them), so we derive
  // and store the filterable metadata but never drop non-US here.
  const meta = deriveJobMeta({ title, location, description });

  const submitted = input.submittedDate ?? (status === "applied" ? now : null);
  const res = await convex().mutation(api.jobs.createOne, {
    doc: cleanDoc({
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
    }),
    initialStatus: status,
    submittedAt: submitted,
  });

  if (!res.inserted) return { inserted: false };
  return { inserted: true, jobId: res.jobId };
}
