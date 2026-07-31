"use server";

import { revalidatePath } from "next/cache";
import { api, convex } from "@/lib/convex/server";

// Add a job to the auto-apply bucket from server-rendered surfaces
// (dashboard top matches, feed rows). Idempotent — re-queueing an already
// queued job is a no-op.
export async function queueJobAction(jobId: string): Promise<void> {
  await convex().mutation(api.applyQueue.add, { jobId: jobId as never });
  revalidatePath("/");
  revalidatePath("/feed");
  revalidatePath("/apply");
}
