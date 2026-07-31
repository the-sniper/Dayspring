"use server";

import { revalidatePath } from "next/cache";
import { pullAllJobs, type PullResult } from "@/lib/jobs/pull";

export async function pullJobsAction(): Promise<PullResult> {
  const result = await pullAllJobs();
  revalidatePath("/feed");
  revalidatePath("/", "layout");
  return result;
}
