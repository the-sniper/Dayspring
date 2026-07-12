"use server";

import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import { tailorJob } from "@/lib/claude/tailor";
import { api, convex } from "@/lib/convex/server";
import { getProfile, MIN_JD_CHARS } from "@/lib/jobs/score";
import { latestCompanyBrief } from "@/lib/research/core";

export async function tailorJobAction(
  jobId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!await hasApiKey()) {
    return { ok: false, error: "Needs ANTHROPIC_API_KEY in .env.local (see Settings)." };
  }
  const profile = await getProfile();
  if (!profile) {
    return { ok: false, error: "No profile yet — paste your resume in Settings first." };
  }
  const job = await convex().query(api.jobs.getWithCompany, { id: jobId as never });
  if (!job) return { ok: false, error: "Job not found" };
  if (job.description.length < MIN_JD_CHARS) {
    return { ok: false, error: "Insufficient JD — add a description before tailoring." };
  }

  // Thread the latest research brief for this company (if any) into tailoring.
  const brief = (await latestCompanyBrief(job.companyId))?.brief ?? null;

  try {
    const res = await tailorJob(
      profile,
      {
        title: job.title,
        companyName: job.companyName,
        location: job.location ?? null,
        description: job.description,
      },
      brief,
    );
    await convex().mutation(api.jobs.patch, {
      id: jobId as never,
      patch: {
        tailoredBullets: res.bullets,
        coverLetter: res.coverLetter,
        tailoredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tailoring failed" };
  }
}
