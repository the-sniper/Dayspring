import Link from "next/link";
import { Users2, ArrowLeft, Cpu } from "lucide-react";
import PageHeader from "@/components/page-header";
import TierSwitcher, { type TierCard } from "@/components/tier-switcher";
import MemoryEditor from "@/components/memory-editor";
import OpsButton from "@/components/ops-button";
import EmployeeAvatar from "@/components/employee-avatar";
import { getCalibrations, suiteSize } from "@/lib/orchestra/evalcore";
import { api, convex } from "@/lib/convex/server";
import { getBannedData, getLessonsData, getVoiceData } from "@/lib/orchestra/memory";
import OrgChart from "@/components/org-chart";
import { localAvatar } from "@/lib/orchestra/avatars";
import { EMPLOYEES, reportsToLabel, TEAMS } from "@/lib/orchestra/registry";
import { resolveTier, TIERS } from "@/lib/orchestra/tiers";
import { fmtDate } from "@/lib/orchestra/format";
import { todayDate } from "@/lib/orchestra/types";
import { isHosted } from "@/lib/hosted";
import { cn } from "@/lib/utils";

import TeamTabs from "@/components/team-tabs";

export const dynamic = "force-dynamic";

// /company/team — the employee directory + the model-tier dial.

const MODEL_SHORT: Record<string, string> = {
  "claude-opus-5": "Opus 5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-haiku-4-5": "Haiku 4.5",
};

const TEAM_DOT: Record<string, string> = {
  Executive: "bg-brand-500",
  "GTM & Socials": "bg-blue-400",
  "Ops & Quality": "bg-purple-400",
  "Product & Eng": "bg-emerald-500",
};

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "directory" } = await searchParams;
  const since = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [tier, scorecard, todayTasks, voiceData, bannedData, lessonsData, user] =
    await Promise.all([
      resolveTier(),
      convex().query(api.orchestra.scorecard, { sinceDate: since }),
      convex().query(api.orchestra.tasksForRun, { runDate: todayDate() }),
      getVoiceData(),
      getBannedData(),
      getLessonsData(),
      convex().query(api.users.me, {}),
    ]);
  const calibrations = await getCalibrations();
  const goldenCases = suiteSize();

  // Working = has a live task on today's board right now; bench = active
  // employee with nothing in flight (normal between runs).
  const workingRoles = new Set(
    todayTasks
      .filter((t) => ["queued", "in_progress", "delivered"].includes(t.status))
      .map((t) => t.role),
  );

  // Live role labels for the tier cards, straight from the registry.
  const namesFor = (slot: "lead" | "worker" | "grunt") => {
    const names = EMPLOYEES.filter(
      (e) => e.status === "active" && e.modelRole === slot,
    ).map((e) => e.name);
    return names.length ? names.join(", ") : "unused today";
  };
  const roleNames = {
    lead: namesFor("lead"),
    worker: namesFor("worker"),
    grunt: namesFor("grunt"),
  };

  const tierCards: TierCard[] = Object.values(TIERS).map((t) => ({
    id: t.id,
    label: t.label,
    tagline: t.tagline,
    models: t.models,
    estDaily: t.estDaily,
    tradeoff: t.tradeoff,
  }));

  return (
    <div className={cn("stagger-load px-4 pb-20", tab === "chart" ? "mx-auto w-full" : "mx-auto max-w-7xl")}>
      <div className="pt-8">
        <PageHeader
          eyebrow="Agent Orchestra"
          icon={<Users2 size={14} />}
          title={tab === "chart" ? "Strategic Command" : "Team Directory"}
          description={
            tab === "chart" ? (
              <span className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live view of all neural nodes and operational hierarchy.
              </span>
            ) : (
              <>
                Global oversight of agent capabilities, model assignments, and
                collective memory. Active tier: <span className="font-bold text-foreground underline decoration-brand-500/30">{tier.label}</span>.
              </>
            )
          }
          actions={
            <Link
              href="/company"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft size={14} /> Board
            </Link>
          }
        />
      </div>

      <div className="mt-4">
        <TeamTabs />
      </div>

      {tab === "chart" ? (
        <section className="w-full">
          <OrgChart working={workingRoles} userName={user?.name || "Architect"} />
        </section>
      ) : (
        <div className="flex flex-col gap-16">
          {/* Administrative / Configuration Area */}
          <div className="space-y-12 rounded-[2rem] border border-border/60 bg-secondary/5 p-8 sm:p-10 shadow-inner shadow-black/[0.02]">
            <section>
              <div className="mb-6 flex flex-col gap-1">
                <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-brand-600 dark:text-brand-400">
                  <Cpu size={12} /> Model Intelligence
                </h2>
                <p className="text-sm text-muted-foreground">
                  Select the underlying model tier for your agent workforce.
                </p>
              </div>
              <TierSwitcher tiers={tierCards} current={tier.id} roleNames={roleNames} />
            </section>

            {!isHosted() && (
              <section>
                <div className="mb-6 flex flex-col gap-1">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                    Performance Calibration
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Evaluate the current tier against the golden test suite.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                    <OpsButton
                      action="freeze"
                      label={`Freeze today's case (${goldenCases}/20)`}
                      hint="Snapshots today's real pipeline data as a frozen test case. Free, instant, no model calls — do it once a day until 20."
                    />
                    <OpsButton
                      action="calibrate"
                      label="Run calibration"
                      primary
                      hint="Re-runs the researcher on every frozen case with the ACTIVE tier and scores each brief 0-10. Compares to the last run on this tier — a >10-pt drop means revert your last change. Costs ~$0.05 per case."
                    />
                  </div>
                  {calibrations.length > 0 && (
                    <div className="mt-6 overflow-hidden rounded-xl border border-border/60">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-secondary/50 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <th className="px-4 py-2">date</th>
                            <th className="px-4 py-2">tier</th>
                            <th className="px-4 py-2 text-right">pass rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...calibrations].reverse().slice(0, 6).map((c) => (
                            <tr key={`${c.date}-${c.tier}`} className="border-t border-border/40">
                              <td className="px-4 py-3 text-muted-foreground">{fmtDate(c.date)}</td>
                              <td className="px-4 py-3 font-medium text-foreground">{c.tier}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                                {c.total ? `${c.passed}/${c.total} (${Math.round((c.passed / c.total) * 100)}%)` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section>
              <div className="mb-6 flex flex-col gap-1">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                  Shared Company Memory
                </h2>
                <p className="text-sm text-muted-foreground">
                  Persistent context that agents read before every orchestration run.
                </p>
              </div>
              <MemoryEditor voice={voiceData} banned={bannedData} lessons={lessonsData} />
            </section>
          </div>

          {/* Team Roster */}
          <div className="space-y-12">
            {TEAMS.map((team) => {
              const members = EMPLOYEES.filter((e) => e.team === team);
              if (!members.length) return null;
              return (
                <div key={team} className="group/team">
                  <div className="mb-6 flex items-baseline justify-between border-b border-border/40 pb-4 transition-colors group-hover/team:border-brand-500/20">
                    <h2 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight text-foreground">
                      <span className={cn("h-2.5 w-2.5 rounded-full shadow-sm", TEAM_DOT[team])} />
                      {team}
                    </h2>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                      {members.length} members
                    </span>
                  </div>
                  
                  <div className="grid gap-6 sm:grid-cols-2">
                    {members.map((e) => {
                      const planned = e.status === "planned";
                      const model =
                        e.modelRole === "code"
                          ? "Deterministic Code"
                          : (MODEL_SHORT[tier.models[e.modelRole]] ??
                            tier.models[e.modelRole]);
                      const score = scorecard[e.id];
                      const yieldPct =
                        score && score.total > 0
                          ? Math.round((score.verified / score.total) * 100)
                          : null;
                      return (
                        <Link
                          href={`/company/team/${e.id}`}
                          key={e.id}
                          className={cn(
                            "group relative flex flex-col overflow-hidden rounded-[1.75rem] border bg-card p-6 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-brand-500/40 hover:shadow-[0_20px_40px_-20px_rgba(245,158,11,0.25)]",
                            planned
                              ? "border-dashed border-border/80 opacity-70 grayscale-[0.5]"
                              : "border-border/80",
                          )}
                        >
                          {/* Hover Glow */}
                          <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-brand-500/5 blur-[60px] transition-opacity opacity-0 group-hover:opacity-100" />
                          
                          <div className="relative flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <EmployeeAvatar
                                name={e.name}
                                avatar={localAvatar(e)}
                                avatarFocus={e.avatarFocus}
                                avatarZoom={e.avatarZoom}
                                muted={planned}
                                className="h-20 w-20 ring-4 ring-background shadow-xl transition-all duration-500 group-hover:scale-105 group-hover:ring-brand-500/10"
                              />
                              <div className="space-y-0.5">
                                <p className="font-display text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-400">
                                  {e.name}
                                </p>
                                <p className="text-xs font-semibold text-muted-foreground/80">
                                  {e.title}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider shadow-sm border",
                                  planned
                                    ? "bg-secondary/50 text-muted-foreground border-transparent"
                                    : e.modelRole === "code"
                                      ? "bg-purple-500/5 text-purple-600 dark:text-purple-400 border-purple-500/10"
                                      : workingRoles.has(e.id)
                                        ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/10"
                                        : "bg-stone-500/5 text-stone-500 dark:text-stone-400 border-stone-500/10",
                                )}
                              >
                                {!planned && e.modelRole !== "code" && (
                                  <div className="relative flex h-1.5 w-1.5">
                                    <div className={cn(
                                      "absolute inset-0 rounded-full",
                                      workingRoles.has(e.id) ? "animate-ping bg-emerald-400 opacity-75" : "bg-stone-400"
                                    )} />
                                    <div className={cn(
                                      "relative h-1.5 w-1.5 rounded-full",
                                      workingRoles.has(e.id) ? "bg-emerald-500" : "bg-stone-400"
                                    )} />
                                  </div>
                                )}
                                {planned
                                  ? `Phase ${e.phase}`
                                  : e.modelRole === "code"
                                    ? "Always On"
                                    : workingRoles.has(e.id)
                                      ? "Working Now"
                                      : "On Bench"}
                              </span>
                            </div>
                          </div>

                          <div className="relative mt-6 space-y-4">
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-medium text-muted-foreground/80">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Reports to</span>
                                <span className="font-semibold text-foreground">{reportsToLabel(e)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Runs on</span>
                                <span className="rounded-md bg-secondary/80 px-2 py-0.5 font-mono text-[10px] font-bold text-foreground ring-1 ring-inset ring-black/5 dark:ring-white/5">
                                  {model}
                                </span>
                              </div>
                            </div>

                            {yieldPct !== null && (
                              <div className="flex flex-col gap-2 rounded-xl bg-secondary/30 p-3 ring-1 ring-inset ring-black/5 dark:ring-white/5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Performance (7d)</span>
                                  <span className={cn(
                                    "font-mono text-xs font-bold",
                                    yieldPct >= 70
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : yieldPct >= 40
                                        ? "text-amber-600 dark:text-amber-400"
                                        : "text-rose-500",
                                  )}>
                                    {yieldPct}% Verified
                                  </span>
                                </div>
                                <div className="h-1 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all duration-1000",
                                      yieldPct >= 70 ? "bg-emerald-500" : yieldPct >= 40 ? "bg-amber-500" : "bg-rose-500"
                                    )}
                                    style={{ width: `${yieldPct}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          <ul className="relative mt-6 space-y-1.5 border-t border-border/40 pt-5">
                            {e.responsibilities.slice(0, 3).map((r) => (
                              <li key={r} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground/90">
                                <div className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500/40" />
                                {r}
                              </li>
                            ))}
                            {e.responsibilities.length > 3 && (
                              <li className="text-[10px] font-bold italic text-muted-foreground/40">
                                + {e.responsibilities.length - 3} more responsibilities
                              </li>
                            )}
                          </ul>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
