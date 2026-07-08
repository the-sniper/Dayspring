// Next-free apply-assist context — read by scripts/apply.ts (the attended CLI).
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobs, settings } from "@/lib/db/schema";
import { extractFields, type ApplicantFields } from "@/lib/apply/fields";
import { getProfile } from "@/lib/jobs/score";
import { latestJobBrief } from "@/lib/research/core";

export type ApplyStatus = "in_progress" | "submitted" | "abandoned";

export type ApplyContext = {
  job: {
    id: number;
    title: string;
    url: string | null;
    source: string;
    companyId: number;
    companyName: string;
    tailoredBullets: string[] | null;
    coverLetter: string | null;
  };
  fields: ApplicantFields;
  resumePath: string | null;
  briefSummary: string | null;
};

function getSetting(key: string): string | null {
  return (
    db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
  );
}

export function loadApplyContext(
  jobId: number,
): { ok: true; ctx: ApplyContext } | { ok: false; error: string } {
  const profile = getProfile();
  if (!profile) {
    return { ok: false, error: "No profile in Settings — apply-assist fills from it." };
  }
  const row = db
    .select({ job: jobs, companyName: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .get();
  if (!row) return { ok: false, error: "Job not found" };
  if (!row.job.url) return { ok: false, error: "Job has no application URL." };

  const resumePath = getSetting("resumePath");
  const resumeOk = resumePath ? fs.existsSync(resumePath) : false;

  return {
    ok: true,
    ctx: {
      job: {
        id: row.job.id,
        title: row.job.title,
        url: row.job.url,
        source: row.job.source,
        companyId: row.job.companyId,
        companyName: row.companyName,
        tailoredBullets: row.job.tailoredBullets,
        coverLetter: row.job.coverLetter,
      },
      fields: extractFields(profile),
      resumePath: resumeOk ? resumePath : null,
      briefSummary: latestJobBrief(jobId)?.brief ?? null,
    },
  };
}

export function setApplyStatus(
  jobId: number,
  status: ApplyStatus,
  logLine?: string,
): void {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  const log = [...(job?.applyLog ?? [])];
  if (logLine) log.push(`${new Date().toISOString().slice(11, 19)} ${logLine}`);
  db.update(jobs)
    .set({ applyStatus: status, applyLog: log, updatedAt: new Date().toISOString() })
    .where(eq(jobs.id, jobId))
    .run();
}

export function appendApplyLog(jobId: number, logLine: string): void {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  const log = [...(job?.applyLog ?? []), `${new Date().toISOString().slice(11, 19)} ${logLine}`];
  db.update(jobs).set({ applyLog: log }).where(eq(jobs.id, jobId)).run();
}
