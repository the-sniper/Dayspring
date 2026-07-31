// Next-free apply-assist context — read by scripts/apply.ts (the attended CLI).
import { api, convex } from "@/lib/convex/server";
import { extractFields, type ApplicantFields } from "@/lib/apply/fields";
import { getProfile } from "@/lib/jobs/score";
import { getDefaultProfile } from "@/lib/profiles/core";
import { latestJobBrief } from "@/lib/research/core";
import { listMasters, resumePdfForJob } from "@/lib/resumes/core";
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

export type ApplyOptions = {
  // Pin a specific master resume (auto-apply queue); default resolution is
  // tailored → primary master → resumePath setting.
  masterResumeId?: string | null;
};

export async function loadApplyContext(
  jobId: string,
  opts: ApplyOptions = {},
): Promise<{ ok: true; ctx: ApplyContext } | { ok: false; error: string }> {
  const profile = await getProfile();
  if (!profile) {
    return { ok: false, error: "No profile in Settings — apply-assist fills from it." };
  }
  const job = await convex().query(api.jobs.getWithCompany, { id: jobId as never });
  if (!job) return { ok: false, error: "Job not found" };
  if (!job.url) return { ok: false, error: "Job has no application URL." };

  const resume = await resumePdfForJob(jobId, opts.masterResumeId ?? null);
  if (opts.masterResumeId && !resume) {
    return { ok: false, error: "The selected resume has no PDF attached — pick another." };
  }

  // Contact-field fallback chain: structured profile columns → regex over
  // the profile text → regex over the primary master resume → the signed-in
  // account's own name/email. A bare profile (e.g. fresh onboarding) must
  // never leave name and email unfillable — that data always exists.
  const p = await getDefaultProfile();
  const regex = extractFields(profile);
  const masters = await listMasters().catch(() => []);
  const primaryMaster = masters.find((m) => m.isPrimary) ?? masters[0] ?? null;
  const fromResume = primaryMaster?.content
    ? extractFields(primaryMaster.content)
    : null;
  const me = await convex().query(api.users.me, {}).catch(() => null);

  const pick = (...vals: (string | null | undefined)[]) =>
    vals.find((v) => !!v && v.trim().length > 0) ?? null;
  const fullName = pick(p?.fullName, regex.fullName, fromResume?.fullName, me?.name);
  const fields: ApplicantFields = {
    fullName,
    firstName: pick(fullName?.split(/\s+/)[0], regex.firstName, fromResume?.firstName),
    lastName: pick(fullName?.split(/\s+/).slice(-1)[0], regex.lastName, fromResume?.lastName),
    email: pick(p?.email, regex.email, fromResume?.email, me?.email),
    phone: pick(p?.phone, regex.phone, fromResume?.phone),
    linkedin: pick(p?.linkedin, regex.linkedin, fromResume?.linkedin),
    github: pick(p?.github, regex.github, fromResume?.github),
    portfolio: pick(p?.website, regex.portfolio, fromResume?.portfolio),
    location: pick(p?.location, regex.location, fromResume?.location),
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
