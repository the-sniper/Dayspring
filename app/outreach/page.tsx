import Link from "next/link";
import { Send, Inbox, Clock, CheckCircle2, PartyPopper } from "lucide-react";
import CheckRepliesButton from "@/components/check-replies-button";
import OutreachEditor from "@/components/outreach-editor";
import PageHeader from "@/components/page-header";
import { markRepliedAction } from "@/lib/actions/outreach";
import NudgeButton from "@/components/nudge-button";
import { api, convex } from "@/lib/convex/server";
import { hasGmail } from "@/lib/integrations/gmail/client";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const queue = await convex().query(api.outreach.queue, {});
  const rows = queue
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((r) => ({
      o: r,
      contactName: r.contact?.name ?? "(unknown)",
      contactTitle: r.contact?.title ?? null,
      contactEmail: r.contact?.email ?? null,
      jobTitle: r.job?.title ?? null,
      companyName: r.company?.name ?? null,
      jobId: r.job?.id ?? null,
    }));

  const gmail = hasGmail();
  const today = new Date().toISOString().slice(0, 10);
  const drafts = rows.filter((r) => !r.o.sentAt);
  const awaiting = rows.filter((r) => r.o.sentAt && !r.o.repliedAt);
  const replied = rows.filter((r) => r.o.repliedAt);

  const contextLine = (r: (typeof rows)[number]) => (
    <p className="text-xs font-medium text-muted-foreground">
      to <span className="font-semibold text-foreground">{r.contactName}</span>
      {r.contactTitle && ` (${r.contactTitle})`}
      {r.jobTitle && (
        <>
          {" · re "}
          <Link
            href={`/jobs/${r.jobId}`}
            className="font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
          >
            {r.jobTitle}
          </Link>
          {r.companyName && ` at ${r.companyName}`}
        </>
      )}
    </p>
  );

  const sectionLabel =
    "flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <div className="mx-auto max-w-3xl stagger-load">
      <PageHeader
        eyebrow="Pipeline"
        icon={<Send size={14} />}
        title="Outreach"
        description={
          <>
            Claude drafts, you approve, nothing sends itself.
            {!gmail &&
              " Gmail isn't connected — see Settings; mailto fallback active."}
          </>
        }
        actions={<CheckRepliesButton enabled={gmail} />}
      />

      <section>
        <h2 className={sectionLabel}>
          <Inbox size={14} className="text-brand-500" />
          Drafts awaiting approval ({drafts.length})
        </h2>
        <div className="mt-3 space-y-4">
          {drafts.map((r) => (
            <div
              key={r.o.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
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
            <p className="rounded-2xl border border-dashed border-border px-3 py-8 text-center text-sm font-medium text-muted-foreground">
              No drafts — hit &ldquo;Draft outreach&rdquo; on a job&apos;s
              contact, or from a company page.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className={sectionLabel}>
          <Clock size={14} className="text-brand-500" />
          Awaiting reply ({awaiting.length})
        </h2>
        <div className="mt-3 space-y-2.5">
          {awaiting.map((r) => {
            const due = r.o.followUpDue && r.o.followUpDue <= today;
            return (
              <div
                key={r.o.id}
                className={`rounded-2xl border bg-card px-4 py-3.5 shadow-sm ${due ? "border-brand-400 ring-1 ring-brand-400/20" : "border-border"}`}
              >
                {contextLine(r)}
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {r.o.subject}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
                  <span>sent {r.o.sentAt?.slice(0, 10)}</span>
                  {r.o.followUpDue && (
                    <span
                      className={
                        due ? "font-semibold text-brand-600 dark:text-brand-400" : ""
                      }
                    >
                      follow up {due ? "due" : "on"} {r.o.followUpDue}
                    </span>
                  )}
                  <span className="ml-auto flex gap-2">
                    {due && <NudgeButton originalId={r.o.id} />}
                    <form action={markRepliedAction.bind(null, r.o.id)}>
                      <button className="rounded-lg border border-emerald-300 px-2.5 py-1 text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40">
                        Got reply
                      </button>
                    </form>
                  </span>
                </div>
              </div>
            );
          })}
          {awaiting.length === 0 && (
            <p className="text-sm font-medium text-muted-foreground">
              Nothing in flight.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className={sectionLabel}>
          <CheckCircle2 size={14} className="text-brand-500" />
          Replied ({replied.length})
        </h2>
        <ul className="mt-3 space-y-1.5">
          {replied.map((r) => (
            <li
              key={r.o.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground"
            >
              <PartyPopper size={14} className="shrink-0 text-brand-500" />
              <span className="font-semibold text-foreground">
                {r.contactName}
              </span>
              {r.companyName && ` · ${r.companyName}`} — replied{" "}
              {r.o.repliedAt?.slice(0, 10)}
            </li>
          ))}
          {replied.length === 0 && (
            <li className="text-sm font-medium text-muted-foreground">
              None yet — they&apos;re coming.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
