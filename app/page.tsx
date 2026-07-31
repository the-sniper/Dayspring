import Link from "next/link";
import { 
  ArrowRight, 
  Calendar, 
  Clock, 
  Inbox, 
  LayoutDashboard, 
  MessageSquare, 
  Plus, 
  Sparkles,
  TrendingUp,
  Building2,
  Zap,
} from "lucide-react";
import RoleChip from "@/components/role-chip";
import ScoreBadge from "@/components/score-badge";
import JobQuickActions from "@/components/job-quick-actions";
import Tip from "@/components/tip";
import VerificationCodes from "@/components/verification-codes";
import PageHeader from "@/components/page-header";
import ButtonLink from "@/components/button-link";
import { hasGmail } from "@/lib/integrations/gmail/client";
import { api, convex } from "@/lib/convex/server";
import { getSetting } from "@/lib/settings/store";
import { outreachDue, staleApplications } from "@/lib/outreach/due";
import { KANBAN_STATUSES, type JobStatus, type RoleType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["applied", "screen", "interview", "offer"];

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
        eyebrow="Command Center"
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 mb-10">
        {KANBAN_STATUSES.map((s) => (
          <Link
            key={s}
            href="/board"
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:border-brand-500/50 hover:shadow-xl hover:shadow-brand-500/5"
          >
            <div className="relative z-10">
              <p className="text-3xl font-black tracking-tight text-foreground tabular-nums">
                {statusCounts.get(s) ?? 0}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{s}</p>
            </div>
            <div className="absolute -right-2 -top-2 text-muted-foreground/5 group-hover:text-brand-500/10 transition-colors">
              <TrendingUp size={64} />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Column */}
        <div className="lg:col-span-8 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Sparkles size={18} className="text-brand-500" />
                Top Matches Today
              </h2>
              <div className="flex items-center gap-4">
                <Link href="/apply" className="group flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  <Zap size={12} /> Auto-Apply queue
                </Link>
                <Link href="/feed" className="group flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  View Feed <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
            
            <div className="space-y-3">
              {needsDecision.map((j) => (
                <div
                  key={j.id}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:border-brand-500/30 hover:shadow-md"
                >
                  <div className="min-w-0 flex-1">
                    <Tip label={j.title}>
                      <Link
                        href={`/jobs/${j.id}`}
                        className="block truncate font-bold text-foreground hover:text-brand-600 transition-colors"
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
              ))}
              {needsDecision.length === 0 && (
                <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground mb-4">
                    <Inbox size={20} />
                  </div>
                  <p className="text-sm font-bold text-foreground">Nothing waiting</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your 10 best-scoring new roles appear here daily — run scoring from the feed to fill it.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Clock size={18} className="text-brand-500" />
                Recent Activity
              </h2>
            </div>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {activity.map((e) => (
                  <div key={e.id} className="flex items-center gap-4 p-4 text-sm transition-colors hover:bg-secondary/20">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold tabular-nums text-muted-foreground">
                      {e.at.slice(5, 10)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/jobs/${e.jobId}`}
                        className="font-bold text-foreground hover:text-brand-600 transition-colors"
                      >
                        {e.title}
                      </Link>
                      <p className="text-xs font-medium text-muted-foreground truncate">{e.companyName}</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tighter">
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
                  <div className="p-10 text-center text-sm text-muted-foreground font-medium">
                    No activity recorded yet.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar Column */}
        <div className="lg:col-span-4 space-y-8">
          <VerificationCodes hasGmail={gmailConnected} />

          {(dueOutreach.length > 0 || staleApps.length > 0) && (
            <section className="rounded-2xl bg-brand-500 p-5 text-white shadow-xl shadow-brand-500/20">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest mb-4">
                <MessageSquare size={16} strokeWidth={3} />
                Follow-ups Due
              </h2>
              <div className="space-y-3">
                {dueOutreach.map((o) => (
                  <div key={`o${o.id}`} className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                    <p className="text-xs font-bold text-white/90">
                      <span className="mr-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">Outreach</span>
                      {o.contactName}
                    </p>
                    <p className="mt-1 text-[11px] text-white/70 line-clamp-1">
                      {o.companyName} — quiet since {o.sentAt?.slice(0, 10)}
                    </p>
                    <Link href="/outreach" className="mt-2 block text-center rounded-lg bg-white py-1.5 text-[10px] font-black uppercase tracking-widest text-brand-600 transition-transform hover:scale-[1.02] active:scale-95">
                      Nudge Now
                    </Link>
                  </div>
                ))}
                {staleApps.map((a) => (
                  <div key={`a${a.jobId}`} className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                    <p className="text-xs font-bold text-white/90">
                      <span className="mr-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">Application</span>
                      {a.title}
                    </p>
                    <p className="mt-1 text-[11px] text-white/70 line-clamp-1">
                      {a.companyName} — quiet since {a.updatedAt.slice(0, 10)}
                    </p>
                    <Link href={`/jobs/${a.jobId}`} className="mt-2 block text-center rounded-lg bg-white/20 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition-transform hover:bg-white/30 active:scale-95">
                      Check Status
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">
              <Calendar size={16} strokeWidth={3} />
              Upcoming Tasks
            </h2>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {nextActions.map((a) => (
                  <div key={a.jobId} className="p-4 transition-colors hover:bg-secondary/20">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className={cn(
                        "text-[10px] font-black tabular-nums tracking-tighter",
                        a.nextActionDue && a.nextActionDue < today ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {a.nextActionDue}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground/50 truncate uppercase tracking-widest">{a.companyName}</span>
                    </div>
                    <Link
                      href={`/jobs/${a.jobId}`}
                      className="text-sm font-bold text-foreground hover:text-brand-600 transition-colors line-clamp-1"
                    >
                      {a.nextAction ?? "Follow up"}
                    </Link>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground line-clamp-1">{a.title}</p>
                  </div>
                ))}
                {nextActions.length === 0 && (
                  <div className="p-10 text-center">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">All Clear</p>
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
