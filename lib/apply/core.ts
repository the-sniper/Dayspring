// Next-free apply-assist context — read by scripts/apply.ts (the attended CLI).
import { api, convex } from "@/lib/convex/server";
import { extractFields, type ApplicantFields } from "@/lib/apply/fields";
import { getProfile } from "@/lib/jobs/score";
import { getDefaultProfile } from "@/lib/profiles/core";
import { latestJobBrief } from "@/lib/research/core";
import { resumePdfForJob } from "@/lib/resumes/core";
import type { ApplicationDefaults } from "@/lib/types";

export type ApplyStatus = "in_progress" | "submitted" | "abandoned";

export type ApplyContext = {
  job: {
    id: string;
    title: string;
    url: string | null;
    source: string;
    companyId: string;
    companyName: string;
    tailoredBullets: string[] | null;
    coverLetter: string | null;
  };
  fields: ApplicantFields;
  // User-set application defaults (M27) — only non-null values ever get
  // filled on a form; null means "the human decides on the page".
  defaults: ApplicationDefaults | null;
  resumePath: string | null;
  // Which resume got attached: per-job tailored > primary master PDF > setting.
  resumeSource: "tailored" | "master" | "settings" | null;
  briefSummary: string | null;
};

export async function loadApplyContext(
  jobId: string,
): Promise<{ ok: true; ctx: ApplyContext } | { ok: false; error: string }> {
  const profile = await getProfile();
  if (!profile) {
    return { ok: false, error: "No profile in Settings — apply-assist fills from it." };
  }
  const job = await convex().query(api.jobs.getWithCompany, { id: jobId as never });
  if (!job) return { ok: false, error: "Job not found" };
  if (!job.url) return { ok: false, error: "Job has no application URL." };

  const resume = await resumePdfForJob(jobId);

  // Structured profile columns beat regex extraction; regex fills the gaps
  // for anything the user hasn't set on the profile page yet.
  const p = await getDefaultProfile();
  const regex = extractFields(profile);
  const fields: ApplicantFields = {
    fullName: p?.fullName ?? regex.fullName,
    firstName: p?.fullName?.split(/\s+/)[0] ?? regex.firstName,
    lastName: p?.fullName?.split(/\s+/).slice(-1)[0] ?? regex.lastName,
    email: p?.email ?? regex.email,
    phone: p?.phone ?? regex.phone,
    linkedin: p?.linkedin ?? regex.linkedin,
    github: p?.github ?? regex.github,
    portfolio: p?.website ?? regex.portfolio,
    location: p?.location ?? regex.location,
  };

  const brief = (await latestJobBrief(jobId))?.brief ?? null;
  return {
    ok: true,
    ctx: {
      job: {
        id: job.id,
        title: job.title,
        url: job.url,
        source: job.source,
        companyId: job.companyId,
        companyName: job.companyName,
        tailoredBullets: job.tailoredBullets ?? null,
        coverLetter: job.coverLetter ?? null,
      },
      fields,
      defaults: p?.defaults ?? null,
      resumePath: resume?.path ?? null,
      resumeSource: resume?.source ?? null,
      briefSummary: brief,
    },
  };
}

export async function setApplyStatus(
  jobId: string,
  status: ApplyStatus,
  logLine?: string,
): Promise<void> {
  const job = await convex().query(api.jobs.getById, { id: jobId as never });
  const log = [...(job?.applyLog ?? [])];
  if (logLine) log.push(`${new Date().toISOString().slice(11, 19)} ${logLine}`);
  await convex().mutation(api.jobs.patch, {
    id: jobId as never,
    patch: { applyStatus: status, applyLog: log, updatedAt: new Date().toISOString() },
  });
}

export async function appendApplyLog(jobId: string, logLine: string): Promise<void> {
  const job = await convex().query(api.jobs.getById, { id: jobId as never });
  const log = [...(job?.applyLog ?? []), `${new Date().toISOString().slice(11, 19)} ${logLine}`];
  await convex().mutation(api.jobs.patch, { id: jobId as never, patch: { applyLog: log } });
}
