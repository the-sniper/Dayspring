import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import ApplicationForm from "@/components/application-form";
import RoleChip from "@/components/role-chip";
import ScoreBadge from "@/components/score-badge";
import StatusSelect from "@/components/status-select";
import { deleteJobAction, updateJobAction } from "@/lib/actions/jobs";
import { db } from "@/lib/db";
import { applications, companies, jobs, stageEvents } from "@/lib/db/schema";
import { JOB_STATUSES, ROLE_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

const input =
  "w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  const row = db
    .select({ job: jobs, companyName: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, id))
    .get();
  if (!row) notFound();
  const { job, companyName } = row;

  const application = db
    .select()
    .from(applications)
    .where(eq(applications.jobId, id))
    .get();

  const events = db
    .select()
    .from(stageEvents)
    .where(eq(stageEvents.jobId, id))
    .orderBy(desc(stageEvents.at))
    .all();

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold leading-tight">{job.title}</h1>
          <p className="mt-1 text-sm text-stone-500">
            {companyName}
            {job.location ? ` · ${job.location}` : ""}
            {job.url && (
              <>
                {" · "}
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-700 hover:underline"
                >
                  posting ↗
                </a>
              </>
            )}
          </p>
        </div>
        <StatusSelect jobId={job.id} status={job.status} statuses={JOB_STATUSES} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
        <RoleChip role={job.roleType} />
        <span>source: {job.source}</span>
        {job.postedAt && <span>posted {job.postedAt.slice(0, 10)}</span>}
        <span>found {job.createdAt.slice(0, 10)}</span>
      </div>

      {/* Match section — the Score button lands with the scoring milestone */}
      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Match</h2>
          <ScoreBadge score={job.matchScore} />
          {job.scoredAt && (
            <span className="text-xs text-stone-400">
              scored {job.scoredAt.slice(0, 10)}
            </span>
          )}
        </div>
        {job.fitSummary ? (
          <p className="mt-2 text-sm text-stone-700">{job.fitSummary}</p>
        ) : (
          <p className="mt-2 text-sm text-stone-400">Not scored yet.</p>
        )}
        {job.gapNotes && job.gapNotes.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {job.gapNotes.map((g) => (
              <li
                key={g}
                className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
              >
                {g}
              </li>
            ))}
          </ul>
        )}
      </section>

      {application && (
        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Application</h2>
          <ApplicationForm jobId={job.id} values={application} />
        </section>
      )}

      {job.description && (
        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Description</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
            {job.description}
          </p>
        </section>
      )}

      <details className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">Edit</summary>
        <form action={updateJobAction.bind(null, job.id)} className="mt-3 grid gap-3">
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Role type</span>
              <select name="roleType" defaultValue={job.roleType ?? ""} className={input}>
                <option value="">—</option>
                {ROLE_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">URL</span>
              <input name="url" defaultValue={job.url ?? ""} className={input} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Location</span>
              <input name="location" defaultValue={job.location ?? ""} className={input} />
            </label>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Description</span>
            <textarea
              name="description"
              defaultValue={job.description}
              rows={6}
              className={input}
            />
          </label>
          <button
            type="submit"
            className="justify-self-start rounded border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
          >
            Save
          </button>
        </form>
      </details>

      <section className="mt-4">
        <h2 className="text-sm font-semibold">History</h2>
        <ul className="mt-2 space-y-1">
          {events.map((e) => (
            <li key={e.id} className="text-xs text-stone-500">
              <span className="tabular-nums">{e.at.slice(0, 16).replace("T", " ")}</span>{" "}
              — {e.fromStatus ? `${e.fromStatus} → ` : ""}
              <span className="font-medium text-stone-700">{e.toStatus}</span>
            </li>
          ))}
          {events.length === 0 && (
            <li className="text-xs text-stone-400">No transitions yet.</li>
          )}
        </ul>
      </section>

      <div className="mt-8 flex items-center justify-between border-t border-stone-200 pt-4">
        <Link href="/board" className="text-sm text-stone-500 hover:underline">
          ← board
        </Link>
        <form action={deleteJobAction.bind(null, job.id)}>
          <button
            type="submit"
            className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Delete job
          </button>
        </form>
      </div>
    </div>
  );
}
