import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import ErrorBanner from "@/components/error-banner";
import JobForm from "@/components/job-form";
import ScoreBadge from "@/components/score-badge";
import StatusSelect from "@/components/status-select";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
import { KANBAN_STATUSES, type JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const columnLabels: Record<string, string> = {
  wishlist: "Wishlist",
  applied: "Applied",
  screen: "Screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const rows = db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      matchScore: jobs.matchScore,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(inArray(jobs.status, [...KANBAN_STATUSES]))
    .orderBy(jobs.updatedAt)
    .all();

  const byStatus = new Map<JobStatus, typeof rows>(
    KANBAN_STATUSES.map((s) => [s, []]),
  );
  for (const r of rows) byStatus.get(r.status)?.push(r);

  const companyNames = db
    .select({ name: companies.name })
    .from(companies)
    .orderBy(companies.name)
    .all()
    .map((c) => c.name);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Board</h1>
        <p className="text-sm text-stone-500">{rows.length} in pipeline</p>
      </div>
      <div className="mt-4">
        <ErrorBanner message={error} />
      </div>

      <details className="mt-2 max-w-xl rounded border border-stone-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium">
          + Add job manually
        </summary>
        <div className="mt-3">
          <JobForm companyNames={companyNames} />
        </div>
      </details>

      <div className="mt-6 overflow-x-auto pb-4">
        <div className="grid min-w-[1100px] grid-cols-6 gap-3">
          {KANBAN_STATUSES.map((status) => {
            const col = byStatus.get(status) ?? [];
            return (
              <div key={status} className="rounded-lg bg-stone-100 p-2">
                <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  {columnLabels[status]}
                  <span className="tabular-nums">{col.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {col.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-md border border-stone-200 bg-white p-2 shadow-sm"
                    >
                      <Link
                        href={`/jobs/${job.id}`}
                        className="block text-sm font-medium leading-snug hover:text-amber-700"
                      >
                        {job.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {job.companyName}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-1">
                        <ScoreBadge score={job.matchScore} />
                        <StatusSelect jobId={job.id} status={job.status} />
                      </div>
                    </div>
                  ))}
                  {col.length === 0 && (
                    <p className="px-1 py-3 text-center text-xs text-stone-400">
                      empty
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
