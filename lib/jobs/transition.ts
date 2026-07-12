import { api, convex } from "@/lib/convex/server";
import type { JobStatus } from "@/lib/types";

// The one status-transition function: jobs.status is the single source of
// truth; every change appends a stage_event; the first move into `applied`
// auto-creates the application metadata row. Atomic inside one Convex mutation.
export async function setJobStatusCore(
  jobId: string,
  to: JobStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return await convex().mutation(api.jobs.setStatus, { id: jobId as never, to });
}
