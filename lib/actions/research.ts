"use server";

import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import { briefForCompany, briefForJob } from "@/lib/research/core";

const NO_KEY = "Research needs ANTHROPIC_API_KEY in .env.local (see Settings).";

export type ResearchActionResult =
  | { ok: true; brief: string; sources: { title: string; url: string }[] }
  | { ok: false; error: string };

export async function researchAction(
  subjectType: "job" | "company",
  id: string,
  deep = false,
): Promise<ResearchActionResult> {
  if (!(await hasApiKey())) return { ok: false, error: NO_KEY };
  const res =
    subjectType === "job"
      ? await briefForJob(id, deep)
      : await briefForCompany(id, deep);
  if (res.ok) {
    revalidatePath(subjectType === "job" ? `/jobs/${id}` : `/companies/${id}`);
  }
  return res;
}
