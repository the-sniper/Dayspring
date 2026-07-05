import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import CheckRepliesButton from "@/components/check-replies-button";
import OutreachEditor from "@/components/outreach-editor";
import { markRepliedAction } from "@/lib/actions/outreach";
import NudgeButton from "@/components/nudge-button";
import { db } from "@/lib/db";
import { companies, contacts, jobs, outreach } from "@/lib/db/schema";
import { hasGmail } from "@/lib/integrations/gmail/client";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const rows = db
    .select({
      o: outreach,
      contactName: contacts.name,
      contactTitle: contacts.title,
      contactEmail: contacts.email,
      jobTitle: jobs.title,
      companyName: companies.name,
      jobId: jobs.id,
    })
    .from(outreach)
    .innerJoin(contacts, eq(outreach.contactId, contacts.id))
    .leftJoin(jobs, eq(outreach.jobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .orderBy(desc(outreach.createdAt))
    .all();

  const gmail = hasGmail();
  const today = new Date().toISOString().slice(0, 10);
  const drafts = rows.filter((r) => !r.o.sentAt);
  const awaiting = rows.filter((r) => r.o.sentAt && !r.o.repliedAt);
  const replied = rows.filter((r) => r.o.repliedAt);

  const contextLine = (r: (typeof rows)[number]) => (
    <p className="text-xs text-stone-500">
      to <span className="font-medium text-stone-700">{r.contactName}</span>
      {r.contactTitle && ` (${r.contactTitle})`}
      {r.jobTitle && (
        <>
          {" · re "}
          <Link href={`/jobs/${r.jobId}`} className="text-amber-700 hover:underline">
            {r.jobTitle}
          </Link>
          {r.companyName && ` at ${r.companyName}`}
        </>
      )}
    </p>
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Outreach</h1>
          <p className="mt-1 text-sm text-stone-500">
            Claude drafts, you approve, nothing sends itself.
            {!gmail && " Gmail isn't connected — see Settings; mailto fallback active."}
          </p>
        </div>
        <CheckRepliesButton enabled={gmail} />
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Drafts awaiting approval ({drafts.length})
        </h2>
        <div className="mt-2 space-y-4">
          {drafts.map((r) => (
            <div key={r.o.id} className="rounded-lg border border-stone-200 bg-white p-4">
              {contextLine(r)}
              <div className="mt-2">
                <OutreachEditor
                  id={r.o.id}
                  initialSubject={r.o.subject ?? ""}
                  initialBody={r.o.draft ?? ""}
                  contactEmail={r.contactEmail}
                  hasGmail={gmail}
                />
              </div>
            </div>
          ))}
          {drafts.length === 0 && (
            <p className="rounded-lg border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-400">
              No drafts — hit &ldquo;Draft outreach&rdquo; on a job&apos;s contact, or from a company page.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Awaiting reply ({awaiting.length})
        </h2>
        <div className="mt-2 space-y-2">
          {awaiting.map((r) => {
            const due = r.o.followUpDue && r.o.followUpDue <= today;
            return (
              <div
                key={r.o.id}
                className={`rounded-lg border bg-white px-4 py-3 ${due ? "border-amber-400" : "border-stone-200"}`}
              >
                {contextLine(r)}
                <p className="mt-1 text-sm font-medium">{r.o.subject}</p>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-stone-500">
                  <span>sent {r.o.sentAt?.slice(0, 10)}</span>
                  {r.o.followUpDue && (
                    <span className={due ? "font-semibold text-amber-700" : ""}>
                      follow up {due ? "due" : "on"} {r.o.followUpDue}
                    </span>
                  )}
                  <span className="ml-auto flex gap-2">
                    {due && <NudgeButton originalId={r.o.id} />}
                    <form action={markRepliedAction.bind(null, r.o.id)}>
                      <button className="rounded border border-emerald-300 px-2 py-0.5 text-emerald-700 hover:bg-emerald-50">
                        Got reply
                      </button>
                    </form>
                  </span>
                </div>
              </div>
            );
          })}
          {awaiting.length === 0 && (
            <p className="text-sm text-stone-400">Nothing in flight.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Replied ({replied.length})
        </h2>
        <ul className="mt-2 space-y-1">
          {replied.map((r) => (
            <li key={r.o.id} className="text-sm text-stone-600">
              <span className="font-medium">{r.contactName}</span>
              {r.companyName && ` · ${r.companyName}`} — replied{" "}
              {r.o.repliedAt?.slice(0, 10)} 🎉
            </li>
          ))}
          {replied.length === 0 && (
            <li className="text-sm text-stone-400">None yet — they&apos;re coming.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
