import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Clock,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Building2,
  Zap,
} from "lucide-react";
import RoleChip from "@/components/role-chip";
import ScoreBadge from "@/components/score-badge";
import JobQuickActions from "@/components/job-quick-actions";
import Tip from "@/components/tip";
import VerificationCodes from "@/components/verification-codes";
import ApiUsagePanel from "@/components/api-usage-panel";
import PageHeader from "@/components/page-header";
import ButtonLink from "@/components/button-link";
import { hasGmail } from "@/lib/integrations/gmail/client";
import { api, convex } from "@/lib/convex/server";
import { getSetting } from "@/lib/settings/store";
import { outreachDue, staleApplications } from "@/lib/outreach/due";
import { type JobStatus, type RoleType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatTile } from "@/components/orchestra-ui";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["applied", "screen", "interview", "offer"];
const PIPELINE_FOCUS: JobStatus[] = ["applied", "screen", "interview", "offer"];
const PIPELINE_EDGE: JobStatus[] = ["wishlist", "rejected"];

export default async function DashboardPage() {
  const [countsRaw, needsDecisionRaw, activeJobs, apps, activityRaw] =
    await Promise.all([
      convex().query(api.jobs.statusCounts, {}),
      convex().query(api.jobs.topNewByScore, { limit: 10, minScore: 50 }),
      convex().query(api.jobs.byStatuses, { statuses: ACTIVE_STATUSES }),
      convex().query(api.applications.listAll, {}),
      convex().query(api.stageEvents.recent, { limit: 6 }),
    ]);

  const statusCounts = new Map<JobStatus, number>(
    Object.entries(countsRaw) as [JobStatus, number][],
  );

  const needsDecision = needsDecisionRaw.map((j) => ({
    id: j.id,
    title: j.title,
    matchScore: j.matchScore ?? null,
    roleType: (j.roleType ?? null) as RoleType | null,
    companyName: j.companyName,
  }));

  const activity = activityRaw.map((e) => ({
    id: e.id,
    at: e.at,
    fromStatus: e.fromStatus ?? null,
    toStatus: e.toStatus,
    jobId: e.jobId,
    title: e.jobTitle ?? "",
    companyName: e.companyName ?? "",
  }));

  const jobById = new Map(activeJobs.map((j) => [String(j.id), j]));
  const nextActions = apps
    .filter((a) => {
      const j = jobById.get(String(a.jobId));
      return a.nextActionDue && j && ACTIVE_STATUSES.includes(j.status);
    })
    .sort((a, b) => (a.nextActionDue ?? "").localeCompare(b.nextActionDue ?? ""))
    .slice(0, 5)
    .map((a) => {
      const j = jobById.get(String(a.jobId))!;
      return {
        jobId: a.jobId,
        title: j.title,
        companyName: j.companyName,
        nextAction: a.nextAction ?? null,
        nextActionDue: a.nextActionDue ?? null,
      };
    });

  const today = new Date().toISOString().slice(0, 10);
  const [dueOutreach, staleApps] = await Promise.all([outreachDue(), staleApplications()]);
  const gmailConnected = await hasGmail();

  const lastDailyRun = (await getSetting("lastDailyRun")) ?? undefined;

  return (
    <div className="mx-auto max-w-6xl stagger-load">
      <PageHeader
        eyebrow="Overview"
        icon={<LayoutDashboard size={14} />}
        title="Overview"
        description={
          lastDailyRun ? (
            <span className="flex items-center gap-1.5">
              <Clock size={12} />
              Last sync{" "}
              <span className="font-semibold text-foreground">
                {lastDailyRun.slice(0, 16).replace("T", " ")}
              </span>
            </span>
          ) : (
            "Your job-search pipeline at a glance."
          )
        }
        actions={
          <ButtonLink href="/import">
            <Plus size={16} strokeWidth={2.75} />
            Add Job
          </ButtonLink>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PIPELINE_FOCUS.map((s) => (
          <Link key={s} href="/board" className="block transition-opacity hover:opacity-90">
            <StatTile label={s} value={String(statusCounts.get(s) ?? 0)} />
          </Link>
        ))}
      </div>
      <div className="mb-10 grid grid-cols-2 gap-3">
        {PIPELINE_EDGE.map((s) => (
          <Link
            key={s}
            href="/board"
            className="bezel block transition-opacity hover:opacity-95"
          >
            <div className="bezel-core flex items-center justify-between px-5 py-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {s}
            </span>
            <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {statusCounts.get(s) ?? 0}
            </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-8">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-foreground">
                Top matches today
              </h2>
              <div className="flex items-center gap-4">
                <Link
                  href="/apply"
                  className="group flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  <Zap size={12} /> Auto-Apply queue
                </Link>
                <Link
                  href="/feed"
                  className="group flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  View Feed{" "}
                  <ArrowRight
                    size={12}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              {needsDecision.map((j) => (
                <div key={j.id} className="group bezel block transition-opacity hover:opacity-95">
                  <div className="bezel-core flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <Tip label={j.title}>
                        <Link
                          href={`/jobs/${j.id}`}
                          className="block truncate font-bold text-foreground transition-colors hover:text-brand-600"
                        >
                          {j.title}
                        </Link>
                      </Tip>
                      <div className="mt-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Building2 size={12} />
                        <span>{j.companyName}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <RoleChip role={j.roleType} />
                      <ScoreBadge score={j.matchScore} />
                      <JobQuickActions jobId={j.id} />
                    </div>
                  </div>
                </div>
              ))}
              {needsDecision.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <Inbox size={20} />
                  </div>
                  <p className="font-display text-base font-bold text-foreground">
                    Nothing waiting
                  </p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Your 10 best-scoring new roles appear here daily. Run scoring
                    from the feed to fill it.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-foreground">
                Recent activity
              </h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="divide-y divide-border/60">
                {activity.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-4 p-4 text-sm transition-colors hover:bg-secondary/20"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold tabular-nums text-muted-foreground">
                      {e.at.slice(5, 10)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/jobs/${e.jobId}`}
                        className="font-bold text-foreground transition-colors hover:text-brand-600"
                      >
                        {e.title}
                      </Link>
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        {e.companyName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                      {e.fromStatus && (
                        <>
                          <span className="text-muted-foreground/50">{e.fromStatus}</span>
                          <ArrowRight size={10} className="text-muted-foreground/30" />
                        </>
                      )}
                      <span className="text-brand-600 dark:text-brand-400">{e.toStatus}</span>
                    </div>
                  </div>
                ))}
                {activity.length === 0 && (
                  <div className="p-10 text-center text-sm font-medium text-muted-foreground">
                    No activity recorded yet.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-8 lg:col-span-4">
          <ApiUsagePanel />

          <VerificationCodes hasGmail={gmailConnected} />

          {(dueOutreach.length > 0 || staleApps.length > 0) && (
            <section className="rounded-2xl border border-brand-500/30 bg-brand-500/[0.06] p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                <MessageSquare size={16} />
                Follow-ups due
              </h2>
              <div className="space-y-3">
                {dueOutreach.map((o) => (
                  <div
                    key={`o${o.id}`}
                    className="rounded-xl border border-border/50 bg-card p-3"
                  >
                    <p className="text-xs font-bold text-foreground">
                      <span className="mr-1.5 rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Outreach
                      </span>
                      {o.contactName}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                      {o.companyName} - quiet since {o.sentAt?.slice(0, 10)}
                    </p>
                    <Link
                      href="/outreach"
                      className="mt-2 block rounded-lg bg-brand-500 py-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-brand-950 transition-colors hover:bg-brand-400 active:scale-[0.98]"
                    >
                      Nudge Now
                    </Link>
                  </div>
                ))}
                {staleApps.map((a) => (
                  <div
                    key={`a${a.jobId}`}
                    className="rounded-xl border border-border/50 bg-card p-3"
                  >
                    <p className="text-xs font-bold text-foreground">
                      <span className="mr-1.5 rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                        Application
                      </span>
                      {a.title}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                      {a.companyName} - quiet since {a.updatedAt.slice(0, 10)}
                    </p>
                    <Link
                      href={`/jobs/${a.jobId}`}
                      className="mt-2 block rounded-lg border border-border py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.98]"
                    >
                      Check Status
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-muted-foreground">
              <Calendar size={16} />
              Upcoming tasks
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="divide-y divide-border/60">
                {nextActions.map((a) => (
                  <div key={a.jobId} className="p-4 transition-colors hover:bg-secondary/20">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-wider",
                          a.nextActionDue && a.nextActionDue < today
                            ? "text-rose-500"
                            : "text-muted-foreground",
                        )}
                      >
                        {a.nextActionDue}
                      </span>
                    </div>
                    <Link
                      href={`/jobs/${a.jobId}`}
                      className="font-bold text-foreground transition-colors hover:text-brand-600"
                    >
                      {a.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.companyName}</p>
                    {a.nextAction && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{a.nextAction}</p>
                    )}
                  </div>
                ))}
                {nextActions.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No upcoming tasks.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
