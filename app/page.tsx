import Link from "next/link";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import RoleChip from "@/components/role-chip";
import ScoreBadge from "@/components/score-badge";
import { ignoreJobAction, promoteJobAction } from "@/lib/actions/jobs";
import { db } from "@/lib/db";
import { applications, companies, jobs, stageEvents } from "@/lib/db/schema";
import { KANBAN_STATUSES, type JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const statusCounts = new Map<JobStatus, number>();
  for (const row of db
    .select({ status: jobs.status, id: jobs.id })
    .from(jobs)
    .all()) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }

  const needsDecision = db
    .select({
      id: jobs.id,
      title: jobs.title,
      matchScore: jobs.matchScore,
      roleType: jobs.roleType,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(eq(jobs.status, "new"), gte(jobs.matchScore, 70)))
    .orderBy(desc(jobs.matchScore))
    .limit(10)
    .all();

  const activity = db
    .select({
      id: stageEvents.id,
      at: stageEvents.at,
      fromStatus: stageEvents.fromStatus,
      toStatus: stageEvents.toStatus,
      jobId: jobs.id,
      title: jobs.title,
      companyName: companies.name,
    })
    .from(stageEvents)
    .innerJoin(jobs, eq(stageEvents.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .orderBy(desc(stageEvents.at))
    .limit(10)
    .all();

  const nextActions = db
    .select({
      jobId: jobs.id,
      title: jobs.title,
      companyName: companies.name,
      nextAction: applications.nextAction,
      nextActionDue: applications.nextActionDue,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(
      and(
        isNotNull(applications.nextActionDue),
        inArray(jobs.status, ["applied", "screen", "interview", "offer"]),
      ),
    )
    .orderBy(applications.nextActionDue)
    .limit(8)
    .all();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="mt-4 grid grid-cols-6 gap-2">
        {KANBAN_STATUSES.map((s) => (
          <Link
            key={s}
            href="/board"
            className="rounded-lg border border-stone-200 bg-white p-3 hover:border-amber-300"
          >
            <p className="text-2xl font-semibold tabular-nums">
              {statusCounts.get(s) ?? 0}
            </p>
            <p className="text-xs uppercase tracking-wide text-stone-500">{s}</p>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-xs text-stone-400">
        feed: {statusCounts.get("new") ?? 0} new ·{" "}
        {statusCounts.get("ignored") ?? 0} ignored —{" "}
        <Link href="/feed" className="text-amber-700 hover:underline">
          open feed
        </Link>
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Needs decision
        </h2>
        <div className="mt-2 space-y-2">
          {needsDecision.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <Link
                  href={`/jobs/${j.id}`}
                  className="text-sm font-medium hover:text-amber-700"
                >
                  {j.title}
                </Link>
                <p className="text-xs text-stone-500">{j.companyName}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <RoleChip role={j.roleType} />
                <ScoreBadge score={j.matchScore} />
                <form action={promoteJobAction.bind(null, j.id)}>
                  <button className="rounded bg-stone-900 px-2 py-1 text-xs font-medium text-white hover:bg-stone-700">
                    Promote
                  </button>
                </form>
                <form action={ignoreJobAction.bind(null, j.id)}>
                  <button className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100">
                    Ignore
                  </button>
                </form>
              </div>
            </div>
          ))}
          {needsDecision.length === 0 && (
            <p className="rounded-lg border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-400">
              Nothing waiting — pull the feed and score new roles, then
              high-fit ones appear here.
            </p>
          )}
        </div>
      </section>

      <div className="mt-8 grid grid-cols-2 gap-8">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Next actions due
          </h2>
          <ul className="mt-2 space-y-1.5">
            {nextActions.map((a) => (
              <li key={a.jobId} className="text-sm">
                <span
                  className={`mr-1 tabular-nums text-xs ${
                    a.nextActionDue && a.nextActionDue < today
                      ? "font-semibold text-red-600"
                      : "text-stone-400"
                  }`}
                >
                  {a.nextActionDue}
                </span>
                <Link
                  href={`/jobs/${a.jobId}`}
                  className="hover:text-amber-700"
                >
                  {a.nextAction ?? "follow up"}
                </Link>{" "}
                <span className="text-xs text-stone-400">
                  {a.companyName}
                </span>
              </li>
            ))}
            {nextActions.length === 0 && (
              <li className="text-sm text-stone-400">Nothing due.</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Recent activity
          </h2>
          <ul className="mt-2 space-y-1.5">
            {activity.map((e) => (
              <li key={e.id} className="text-xs text-stone-500">
                <span className="tabular-nums">{e.at.slice(5, 10)}</span> —{" "}
                <Link
                  href={`/jobs/${e.jobId}`}
                  className="font-medium text-stone-700 hover:text-amber-700"
                >
                  {e.title}
                </Link>{" "}
                {e.fromStatus ? `${e.fromStatus} → ` : ""}
                {e.toStatus}
              </li>
            ))}
            {activity.length === 0 && (
              <li className="text-sm text-stone-400">No activity yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
