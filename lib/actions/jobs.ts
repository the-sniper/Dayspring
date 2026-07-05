"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { applications, jobs, outreach, stageEvents } from "@/lib/db/schema";
import { createJobCore } from "@/lib/jobs/create";
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
  const res = createJobCore({
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

export async function setJobStatusAction(jobId: number, to: JobStatus) {
  if (!(JOB_STATUSES as readonly string[]).includes(to)) {
    return { ok: false as const, error: "Invalid status" };
  }
  const res = setJobStatusCore(jobId, to);
  revalidatePath("/", "layout");
  return res;
}

// Void-returning wrappers so server components can bind them as form actions.
export async function promoteJobAction(jobId: number) {
  setJobStatusCore(jobId, "wishlist");
  revalidatePath("/", "layout");
}

export async function ignoreJobAction(jobId: number) {
  setJobStatusCore(jobId, "ignored");
  revalidatePath("/", "layout");
}

export async function updateJobAction(jobId: number, formData: FormData) {
  const roleTypeRaw = String(formData.get("roleType") ?? "");
  db.update(jobs)
    .set({
      roleType: (ROLE_TYPES as readonly string[]).includes(roleTypeRaw)
        ? (roleTypeRaw as RoleType)
        : null,
      url: String(formData.get("url") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      description: String(formData.get("description") ?? ""),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
    .run();
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function updateApplicationAction(
  jobId: number,
  formData: FormData,
) {
  db.update(applications)
    .set({
      resumeVersion: String(formData.get("resumeVersion") ?? "").trim() || null,
      nextAction: String(formData.get("nextAction") ?? "").trim() || null,
      nextActionDue:
        String(formData.get("nextActionDue") ?? "").trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(applications.jobId, jobId))
    .run();
  revalidatePath("/", "layout");
  redirect(`/jobs/${jobId}`);
}

export async function deleteJobAction(jobId: number) {
  db.transaction((tx) => {
    tx.delete(stageEvents).where(eq(stageEvents.jobId, jobId)).run();
    tx.delete(applications).where(eq(applications.jobId, jobId)).run();
    tx.delete(outreach).where(eq(outreach.jobId, jobId)).run();
    tx.delete(jobs).where(eq(jobs.id, jobId)).run();
  });
  revalidatePath("/", "layout");
  redirect("/board");
}
