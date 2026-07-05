"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import { tailorJob } from "@/lib/claude/tailor";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
import { getProfile, MIN_JD_CHARS } from "@/lib/jobs/score";

export async function tailorJobAction(
  jobId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasApiKey()) {
    return { ok: false, error: "Needs ANTHROPIC_API_KEY in .env.local (see Settings)." };
  }
  const profile = getProfile();
  if (!profile) {
    return { ok: false, error: "No profile yet — paste your resume in Settings first." };
  }
  const row = db
    .select({ job: jobs, companyName: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .get();
  if (!row) return { ok: false, error: "Job not found" };
  if (row.job.description.length < MIN_JD_CHARS) {
    return { ok: false, error: "Insufficient JD — add a description before tailoring." };
  }

  try {
    const res = await tailorJob(profile, {
      title: row.job.title,
      companyName: row.companyName,
      location: row.job.location,
      description: row.job.description,
    });
    db.update(jobs)
      .set({
        tailoredBullets: res.bullets,
        coverLetter: res.coverLetter,
        tailoredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, jobId))
      .run();
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tailoring failed" };
  }
}
