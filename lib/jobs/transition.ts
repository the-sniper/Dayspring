import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, jobs, stageEvents } from "@/lib/db/schema";
import type { JobStatus } from "@/lib/types";

// The one status-transition function: jobs.status is the single source of
// truth; every change appends a stage_event; the first move into `applied`
// auto-creates the application metadata row.
export function setJobStatusCore(
  jobId: number,
  to: JobStatus,
): { ok: true } | { ok: false; error: string } {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) return { ok: false, error: "Job not found" };
  if (job.status === to) return { ok: true };

  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(jobs)
      .set({ status: to, updatedAt: now })
      .where(eq(jobs.id, jobId))
      .run();
    tx.insert(stageEvents)
      .values({ jobId, fromStatus: job.status, toStatus: to, at: now })
      .run();
    if (to === "applied") {
      tx.insert(applications)
        .values({ jobId, submittedAt: now, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .run();
    }
  });
  return { ok: true };
}
