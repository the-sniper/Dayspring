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
import {
  Chip,
  Meter,
  Panel,
  QuietLink,
  SectionTitle,
} from "@/components/orchestra-ui";

import TeamTabs from "@/components/team-tabs";

export const dynamic = "force-dynamic";

// /company/team - the employee directory + the model-tier dial.

const MODEL_SHORT: Record<string, string> = {
  "claude-opus-5": "Opus 5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-haiku-4-5": "Haiku 4.5",
};

const TEAM_DOT: Record<string, string> = {
  Executive: "bg-brand-500",
  "GTM & Socials": "bg-blue-400",
  "Ops & Quality": "bg-stone-400",
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
    <div
      className={cn(
        "stagger-load mx-auto w-full",
        tab === "chart" ? "" : "max-w-7xl",
      )}
    >
      <PageHeader
        eyebrow="Team"
        icon={<Users2 size={14} />}
        title={tab === "chart" ? "Org chart" : "Team directory"}
        description={
          tab === "chart" ? (
            "Reporting lines and who is working today."
          ) : (
            <>
              Models, memory, and the people who run the orchestra. Active tier:{" "}
              <span className="font-semibold text-foreground">{tier.label}</span>.
            </>
          )
        }
        actions={
          <QuietLink href="/company">
            <ArrowLeft size={14} /> Board
          </QuietLink>
        }
      />

      <TeamTabs />

      {tab === "chart" ? (
        <section className="w-full">
          <OrgChart working={workingRoles} userName={user?.name || "You"} />
        </section>
      ) : (
        <div className="flex flex-col gap-12">
          <Panel className="space-y-10 p-6 sm:p-8" flush>
            <section>
              <SectionTitle
                eyebrow="Models"
                icon={<Cpu size={12} />}
                title="Model tier"
                hint="Pick the model tier for the next orchestration run."
              />
              <TierSwitcher tiers={tierCards} current={tier.id} roleNames={roleNames} />
            </section>

            {!isHosted() && (
              <section>
                <SectionTitle
                  title="Calibration"
                  hint="Score the active tier against the golden test suite."
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <OpsButton
                    action="freeze"
                    label={`Freeze today's case (${goldenCases}/20)`}
                    className="w-full"
                    hint="Snapshots today's real pipeline data as a frozen test case. Free, instant, no model calls - do it once a day until 20."
                  />
                  <OpsButton
                    action="calibrate"
                    label="Run calibration"
                    primary
                    className="w-full"
                    hint="Re-runs the researcher on every frozen case with the ACTIVE tier and scores each brief 0-10. Compares to the last run on this tier - a >10-pt drop means revert your last change. Costs ~$0.05 per case."
                  />
                </div>
                {calibrations.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-border/60">
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
                              {c.total
                                ? `${c.passed}/${c.total} (${Math.round((c.passed / c.total) * 100)}%)`
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            <section>
              <SectionTitle
                title="Shared memory"
                hint="Context agents read before every orchestration run."
              />
              <MemoryEditor voice={voiceData} banned={bannedData} lessons={lessonsData} />
            </section>
          </Panel>

          <div className="space-y-10">
            {TEAMS.map((team) => {
              const members = EMPLOYEES.filter((e) => e.team === team);
              if (!members.length) return null;
              return (
                <div key={team}>
                  <div className="mb-4 flex items-baseline justify-between border-b border-border/40 pb-3">
                    <h2 className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-foreground">
                      <span className={cn("h-2 w-2 rounded-full", TEAM_DOT[team])} />
                      {team}
                    </h2>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {members.length} {members.length === 1 ? "member" : "members"}
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
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
                      const statusTone =
                        planned
                          ? "quiet"
                          : e.modelRole === "code"
                            ? "default"
                            : workingRoles.has(e.id)
                              ? "success"
                              : "default";
                      return (
                        <Link
                          href={`/company/team/${e.id}`}
                          key={e.id}
                          className={cn(
                            "group bezel block transition-transform active:scale-[0.99]",
                            planned && "opacity-70",
                          )}
                        >
                          <div
                            className={cn(
                              "bezel-core flex flex-col p-5 transition-colors group-hover:border-brand-500/30",
                              planned && "border-dashed",
                            )}
                          >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <EmployeeAvatar
                                name={e.name}
                                avatar={localAvatar(e)}
                                avatarFocus={e.avatarFocus}
                                avatarZoom={e.avatarZoom}
                                muted={planned}
                                className="h-14 w-14 ring-2 ring-background"
                              />
                              <div className="min-w-0 space-y-0.5">
                                <p className="font-display text-base font-bold tracking-tight text-foreground group-hover:text-brand-700 dark:group-hover:text-brand-400">
                                  {e.name}
                                </p>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {e.title}
                                </p>
                              </div>
                            </div>
                            <Chip tone={statusTone}>
                              {planned
                                ? `Phase ${e.phase}`
                                : e.modelRole === "code"
                                  ? "Always on"
                                  : workingRoles.has(e.id)
                                    ? "Working"
                                    : "Bench"}
                            </Chip>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
                            <span>
                              Reports to{" "}
                              <span className="font-semibold text-foreground">
                                {reportsToLabel(e)}
                              </span>
                            </span>
                            <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold text-foreground">
                              {model}
                            </span>
                          </div>

                          {yieldPct !== null && (
                            <div className="mt-4 space-y-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-medium text-muted-foreground">
                                  Verified (7d)
                                </span>
                                <span
                                  className={cn(
                                    "font-mono font-bold",
                                    yieldPct >= 70
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : yieldPct >= 40
                                        ? "text-amber-600 dark:text-amber-400"
                                        : "text-rose-500",
                                  )}
                                >
                                  {yieldPct}%
                                </span>
                              </div>
                              <Meter
                                value={yieldPct}
                                max={100}
                                tone={
                                  yieldPct >= 70
                                    ? "success"
                                    : yieldPct >= 40
                                      ? "warn"
                                      : "danger"
                                }
                              />
                            </div>
                          )}

                          <ul className="mt-4 space-y-1 border-t border-border/40 pt-4">
                            {e.responsibilities.slice(0, 3).map((r) => (
                              <li
                                key={r}
                                className="text-[11px] leading-relaxed text-muted-foreground"
                              >
                                {r}
                              </li>
                            ))}
                            {e.responsibilities.length > 3 && (
                              <li className="text-[10px] font-medium text-muted-foreground/70">
                                +{e.responsibilities.length - 3} more
                              </li>
                            )}
                          </ul>
                          </div>
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
