"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, cleanDoc, convex } from "@/lib/convex/server";
import { createJobCore } from "@/lib/jobs/create";
import { deriveJobMeta } from "@/lib/jobs/derive";
import { setJobStatusCore } from "@/lib/jobs/transition";
import {
  JOB_STATUSES,
  ROLE_TYPES,
  type JobStatus,
  type RoleType,
} from "@/lib/types";

export async function createJobAction(formData: FormData) {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!companyName || !title) {
    redirect(`/board?error=${encodeURIComponent("Company and title are required")}`);
  }
  const roleTypeRaw = String(formData.get("roleType") ?? "");
  const res = await createJobCore({
    companyName,
    title,
    url: String(formData.get("url") ?? ""),
    location: String(formData.get("location") ?? ""),
    roleType: (ROLE_TYPES as readonly string[]).includes(roleTypeRaw)
      ? (roleTypeRaw as RoleType)
      : null,
    description: String(formData.get("description") ?? ""),
    source: "manual",
    status: "wishlist",
  });
  if (!res.inserted) {
    redirect(`/board?error=${encodeURIComponent("Duplicate: that job already exists")}`);
  }
  revalidatePath("/", "layout");
  redirect(`/jobs/${res.jobId}`);
}

export async function setJobStatusAction(jobId: string, to: JobStatus) {
  if (!(JOB_STATUSES as readonly string[]).includes(to)) {
    return { ok: false as const, error: "Invalid status" };
  }
  const res = await setJobStatusCore(jobId, to);
  revalidatePath("/", "layout");
  return res;
}

// Void-returning wrappers so server components can bind them as form actions.
export async function promoteJobAction(jobId: string) {
  await setJobStatusCore(jobId, "wishlist");
  revalidatePath("/", "layout");
}

export async function ignoreJobAction(jobId: string) {
  await setJobStatusCore(jobId, "ignored");
  revalidatePath("/", "layout");
}

export async function updateJobAction(jobId: string, formData: FormData) {
  const roleTypeRaw = String(formData.get("roleType") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "");
  // Re-derive filterable metadata whenever location/description change.
  const existing = await convex().query(api.jobs.getById, { id: jobId as never });
  const meta = deriveJobMeta({
    title: title || existing?.title || "",
    location,
    description,
  });
  await convex().mutation(api.jobs.patch, {
    id: jobId as never,
    patch: cleanDoc({
      roleType: (ROLE_TYPES as readonly string[]).includes(roleTypeRaw)
        ? (roleTypeRaw as RoleType)
        : null,
      url: String(formData.get("url") ?? "").trim() || null,
      location,
      isUs: meta.isUs,
      workplaceType: meta.workplaceType,
      employmentType: meta.employmentType,
      salaryMin: meta.salaryMin,
      salaryMax: meta.salaryMax,
      salaryCurrency: meta.salaryCurrency,
      description,
      updatedAt: new Date().toISOString(),
    }),
  });
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function updateApplicationAction(
  jobId: string,
  formData: FormData,
) {
  // Empty string is the "cleared" state (falsy everywhere it's read); Convex
  // can't delete optional fields over HTTP, so we store "" instead of null.
  await convex().mutation(api.applications.patchByJob, {
    jobId: jobId as never,
    patch: {
      resumeVersion: String(formData.get("resumeVersion") ?? "").trim(),
      nextAction: String(formData.get("nextAction") ?? "").trim(),
      nextActionDue: String(formData.get("nextActionDue") ?? "").trim(),
      updatedAt: new Date().toISOString(),
    },
  });
  revalidatePath("/", "layout");
  redirect(`/jobs/${jobId}`);
}

export async function deleteJobAction(jobId: string) {
  await convex().mutation(api.jobs.deleteCascade, { id: jobId as never });
  revalidatePath("/", "layout");
  redirect("/board");
}

export async function deleteJobsAction(jobIds: string[]) {
  const ids = [...new Set(jobIds.filter(Boolean))].slice(0, 100);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 10) {
    const result = await convex().mutation(api.jobs.deleteManyCascade, {
      ids: ids.slice(i, i + 10) as never,
    });
    deleted += result.deleted;
  }
  revalidatePath("/feed");
  revalidatePath("/", "layout");
  return { deleted };
}
