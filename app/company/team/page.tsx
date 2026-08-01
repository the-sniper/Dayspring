import Link from "next/link";
import { Users2, ArrowLeft, Cpu } from "lucide-react";
import PageHeader from "@/components/page-header";
import TierSwitcher, { type TierCard } from "@/components/tier-switcher";
import { api, convex } from "@/lib/convex/server";
import { EMPLOYEES, TEAMS } from "@/lib/orchestra/registry";
import { resolveTier, TIERS } from "@/lib/orchestra/tiers";
import { cn } from "@/lib/utils";

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

export default async function TeamPage() {
  const since = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [tier, scorecard] = await Promise.all([
    resolveTier(),
    convex().query(api.orchestra.scorecard, { sinceDate: since }),
  ]);

  const tierCards: TierCard[] = Object.values(TIERS).map((t) => ({
    id: t.id,
    label: t.label,
    tagline: t.tagline,
    models: t.models,
    estDaily: t.estDaily,
    tradeoff: t.tradeoff,
  }));

  return (
    <div className="mx-auto max-w-4xl stagger-load">
      <PageHeader
        eyebrow="Orchestra"
        icon={<Users2 size={14} />}
        title="Team"
        description={
          <>
            Who works here, who they answer to, and what they run on. Active
            tier: <span className="font-semibold text-foreground">{tier.label}</span>.
          </>
        }
        actions={
          <Link
            href="/company"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={13} /> Back to board
          </Link>
        }
      />

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <Cpu size={13} /> Model tier
        </h2>
        <TierSwitcher tiers={tierCards} current={tier.id} />
      </section>

      <section className="mt-10">
        {TEAMS.map((team) => {
          const members = EMPLOYEES.filter((e) => e.team === team);
          if (!members.length) return null;
          return (
            <div key={team} className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <span className={cn("h-1.5 w-1.5 rounded-full", TEAM_DOT[team])} />
                {team}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {members.map((e) => {
                  const planned = e.status === "planned";
                  const model =
                    e.modelRole === "code"
                      ? "pure code — no model"
                      : (MODEL_SHORT[tier.models[e.modelRole]] ??
                        tier.models[e.modelRole]);
                  const score = scorecard[e.id];
                  const yieldPct =
                    score && score.total > 0
                      ? Math.round((score.verified / score.total) * 100)
                      : null;
                  return (
                    <div
                      key={e.id}
                      className={cn(
                        "rounded-2xl border bg-card p-4 shadow-sm",
                        planned
                          ? "border-dashed border-border opacity-70"
                          : "border-border",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-xl font-display text-sm font-bold",
                              planned
                                ? "bg-secondary text-muted-foreground"
                                : "bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-sm shadow-brand-500/25",
                            )}
                          >
                            {e.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">
                              {e.name}
                            </p>
                            <p className="text-[11px] font-medium text-muted-foreground">
                              {e.title}
                            </p>
                          </div>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                            planned
                              ? "bg-secondary text-muted-foreground"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {planned ? `Phase ${e.phase}` : "active"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-muted-foreground">
                        <span>
                          Reports to{" "}
                          <span className="font-semibold text-foreground">
                            {e.reportsTo}
                          </span>
                        </span>
                        <span>
                          Runs on{" "}
                          <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                            {model}
                          </span>
                        </span>
                        {yieldPct !== null && (
                          <span>
                            7d score{" "}
                            <span
                              className={cn(
                                "font-semibold",
                                yieldPct >= 70
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : yieldPct >= 40
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-rose-500",
                              )}
                            >
                              {yieldPct}%
                            </span>{" "}
                            <span className="text-muted-foreground/70">
                              ({score.verified}/{score.total} verified
                              {score.escalated ? `, ${score.escalated} esc.` : ""}
                              )
                            </span>
                          </span>
                        )}
                        {!planned && yieldPct === null && e.modelRole !== "code" && (
                          <span className="text-muted-foreground/60">
                            no scored tasks yet
                          </span>
                        )}
                      </div>

                      <ul className="mt-3 flex list-disc flex-col gap-0.5 pl-4 text-[12px] leading-relaxed text-muted-foreground">
                        {e.responsibilities.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
