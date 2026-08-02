import Link from "next/link";
import type { ReactNode } from "react";
import { Bot, AlertTriangle, FileText, ClipboardList, Users2 } from "lucide-react";
import PageHeader from "@/components/page-header";
import OrchestraRunButton from "@/components/orchestra-run-button";
import PostApprovalCard from "@/components/post-approval-card";
import EngRequestForm from "@/components/eng-request-form";
import RetroPanel, { type RetroProposal } from "@/components/retro-panel";
import Markdown from "@/components/markdown";
import OpsButton from "@/components/ops-button";
import SpendResetHint from "@/components/spend-reset-hint";
import { api, convex } from "@/lib/convex/server";
import { dailyCapUsd } from "@/lib/orchestra/ledger";
import { fmtDate, fmtTime } from "@/lib/orchestra/format";
import { displayName, themeCodenames } from "@/lib/orchestra/registry";
import { todayDate } from "@/lib/orchestra/types";
import { isHosted } from "@/lib/hosted";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
// The Run-today server action can take minutes (hosted platforms honor this).
export const maxDuration = 300;

// /company — the orchestra's dashboard (final plan §2 default #6).
// Server component like the rest of the app: state renders from Convex, the
// only client bits are the run button and native <details> expanders.

const ROLE_STYLE: Record<string, string> = {
  atlas: "bg-brand-500/10 text-brand-600 dark:text-brand-400",
  radar: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  sentinel: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  compass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  quill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  herald: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  forge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  probe: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
};

const STATUS_STYLE: Record<string, string> = {
  verified: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  delivered: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  in_progress: "bg-stone-500/10 text-stone-600 dark:text-stone-400",
  queued: "bg-stone-500/10 text-stone-500",
  blocked: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  escalated: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  failed: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function Chip({ text, style }: { text: string; style?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        style ?? "bg-secondary text-muted-foreground",
      )}
    >
      {text.replace("_", " ")}
    </span>
  );
}

function StatTile({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  alert?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-display text-2xl font-semibold",
          alert ? "text-rose-500" : "text-foreground",
        )}
      >
        {value}
      </p>
      {sub && (
        <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  );
}

export default async function CompanyPage() {
  const today = todayDate();
  const since = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [todayReport, lastReport, tasks, scorecard, incidents, spend, forReview, approved] =
    await Promise.all([
      convex().query(api.orchestra.latestReport, { runDate: today }),
      convex().query(api.orchestra.latestReport, {}),
      convex().query(api.orchestra.recentTasks, { limit: 30 }),
      convex().query(api.orchestra.scorecard, { sinceDate: since }),
      convex().query(api.orchestra.recentIncidents, {}),
      convex().query(api.orchestra.spendForDate, { runDate: today }),
      convex().query(api.orchestra.postsByStatus, { status: "queued_for_review" }),
      convex().query(api.orchestra.postsByStatus, { status: "approved" }),
    ]);
  const retro = await convex().query(api.orchestra.latestArtifactOfKind, {
    kind: "retro",
  });
  // The retro body ends with a machine-readable proposals block.
  let retroProposals: RetroProposal[] = [];
  let retroMemo = "";
  if (retro) {
    const m = retro.body.match(/```json\s*([\s\S]*?)```/);
    retroMemo = m ? retro.body.slice(0, m.index).trim() : retro.body;
    if (m) {
      try {
        retroProposals =
          (JSON.parse(m[1]) as { proposals?: RetroProposal[] }).proposals ?? [];
      } catch {
        // memo still renders; proposals just lose their buttons
      }
    }
  }

  // Artifact bodies for the expandable board rows (bounded to what's shown).
  const shown = tasks.slice(0, 12);
  const artifacts = await Promise.all(
    shown.map((t) =>
      t.artifactId
        ? convex().query(api.orchestra.getArtifact, {
            artifactId: t.artifactId,
          })
        : Promise.resolve(null),
    ),
  );
  const artifactByTask = new Map(
    shown.map((t, i) => [String(t._id), artifacts[i]]),
  );

  const roles = Object.entries(scorecard);
  const totals = roles.reduce(
    (acc, [, r]) => ({
      total: acc.total + r.total,
      verified: acc.verified + r.verified,
      escalated: acc.escalated + r.escalated,
      retries: acc.retries + r.retries,
    }),
    { total: 0, verified: 0, escalated: 0, retries: 0 },
  );
  const report = todayReport ?? lastReport;
  const cap = dailyCapUsd();

  return (
    <div className="mx-auto max-w-4xl stagger-load">
      <PageHeader
        eyebrow="Orchestra"
        icon={<Bot size={14} />}
        title="Company"
        description={
          <>
            {displayName("atlas")} plans · {displayName("radar")} researches ·{" "}
            {displayName("sentinel")} verifies. Nothing external
            ships without you.{" "}
            {report
              ? `Last report: ${fmtDate(report.runDate)}.`
              : "No runs yet — start the first one."}
          </>
        }
        actions={
          <>
            <Link
              href="/company/team"
              className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              <Users2 size={14} /> Team & models
            </Link>
            <OrchestraRunButton alreadyRan={!!todayReport} />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Spend today"
          value={`$${spend.costUsd.toFixed(2)}`}
          sub={
            <>
              <p>
                of ${cap.toFixed(2)} cap · {spend.calls} calls
              </p>
              <SpendResetHint />
            </>
          }
          alert={spend.costUsd >= cap}
        />
        <StatTile
          label="First-pass yield · 7d"
          value={
            totals.total
              ? `${Math.round((totals.verified / Math.max(1, totals.total)) * 100)}%`
              : "—"
          }
          sub={`${totals.verified} verified of ${totals.total} tasks`}
        />
        <StatTile
          label="Escalated · 7d"
          value={String(totals.escalated)}
          sub={totals.retries ? `${totals.retries} retries` : "no retries"}
          alert={totals.escalated > 2}
        />
        <StatTile
          label="Incidents"
          value={String(incidents.length)}
          sub="last 20 shown below"
          alert={incidents.some((i) => i.severity === "high")}
        />
      </div>

      {forReview.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            Awaiting your approval ({forReview.length})
          </h2>
          <div className="flex flex-col gap-3">
            {forReview.map((post) => (
              <PostApprovalCard
                key={String(post._id)}
                post={{
                  id: String(post._id),
                  platform: post.platform,
                  angle: post.angle,
                  text: post.text,
                  status: post.status,
                  citations: post.citations,
                }}
              />
            ))}
          </div>
        </section>
      )}

      {approved.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Approved — copy &amp; post, then mark posted ({approved.length})
          </h2>
          <div className="flex flex-col gap-3">
            {approved.map((post) => (
              <PostApprovalCard
                key={String(post._id)}
                post={{
                  id: String(post._id),
                  platform: post.platform,
                  angle: post.angle,
                  text: post.text,
                  status: post.status,
                  citations: post.citations,
                }}
              />
            ))}
          </div>
        </section>
      )}

      {report && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <FileText size={13} /> {report.runDate === today ? "Today's" : "Latest"}{" "}
            report · {fmtDate(report.runDate)} · {fmtTime(report.createdAt)}
          </h2>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <Markdown text={themeCodenames(report.body)} />
          </div>
        </section>
      )}

      {retro && (
        <section className="mt-8">
          <RetroPanel
            runDate={retro.runDate}
            memo={retroMemo}
            proposals={retroProposals}
          />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Operations
        </h2>
        <div className="grid grid-cols-1 gap-6 rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm sm:p-8 md:grid-cols-3 lg:gap-10">
          <OpsButton
            action="retro"
            label="Run weekly retro"
            className="w-full"
            hint="Dumbledore reviews the week — scorecards, incidents, your rejections — and proposes charter changes with evidence. Runs itself on Sundays; idempotent per week."
          />
          {/* Repo-bound tools (filesystem + git + tsc) exist only where the
              server runs beside the repo — hidden on hosted deployments. */}
          {!isHosted() && (
            <>
              <OpsButton
                action="forge"
                label="Run Forge (spec queued requests)"
                className="w-full"
                hint="Fred & George pick up the oldest eng request below, read the actual codebase, and put a spec with acceptance criteria on the board."
              />
              <OpsButton
                action="probe"
                label="Run Probe (review working tree)"
                className="w-full"
                hint="After you (or a Claude Code session) implement a spec: Snape runs typecheck, then adversarially reviews your uncommitted changes against the spec. Verdict decides if it's mergeable."
              />
            </>
          )}
        </div>
      </section>

      {!isHosted() && (
        <section className="mt-8">
          <EngRequestForm />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <ClipboardList size={13} /> Task board
        </h2>
        <div className="flex flex-col gap-3">
          {shown.map((t) => {
            const artifact = artifactByTask.get(String(t._id));
            return (
              <details
                key={String(t._id)}
                className="group rounded-2xl border border-border bg-card shadow-sm transition-all open:shadow-md"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 px-4 py-3">
                  <Chip text={displayName(t.role)} style={ROLE_STYLE[t.role]} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {themeCodenames(t.objective)}
                  </span>
                  {t.verdict && (
                    <Chip
                      text={t.verdict}
                      style={
                        t.verdict === "confirmed"
                          ? STATUS_STYLE.verified
                          : STATUS_STYLE.escalated
                      }
                    />
                  )}
                  <Chip text={t.status} style={STATUS_STYLE[t.status]} />
                  <span className="text-[10px] font-bold text-muted-foreground/60">
                    {fmtDate(t.runDate)} · {fmtTime(t.updatedAt)}
                  </span>
                </summary>
                <div className="border-t border-border/60 px-4 py-4 text-sm">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Definition of done
                      </p>
                      <ul className="mt-1.5 list-disc pl-4 text-[13px] text-foreground">
                        {t.definitionOfDone.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Budget · attempts
                      </p>
                      <p className="mt-1.5 text-[13px] text-foreground">
                        ≤{t.budgets.maxOutputTokens.toLocaleString()} out-tokens ·{" "}
                        ≤{t.budgets.maxToolCalls} tool calls · ≤$
                        {t.budgets.maxUsd} · attempt {t.attempts}
                      </p>
                      {t.verificationNotes && (
                        <>
                          <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {displayName("sentinel")}'s notes
                          </p>
                          <p className="mt-1.5 text-[13px] text-foreground">
                            {themeCodenames(t.verificationNotes)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  {artifact && (
                    <div className="mt-4 rounded-xl bg-secondary/40 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip text={artifact.kind} />
                        <Chip text={artifact.honestStatus} />
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {artifact.model} · ${artifact.costUsd.toFixed(3)} ·{" "}
                          {artifact.tokensOut.toLocaleString()} out
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] font-semibold text-foreground">
                        {artifact.summary}
                      </p>
                      <div className="mt-2 max-h-80 overflow-y-auto">
                        <Markdown text={themeCodenames(artifact.body)} />
                      </div>
                      {artifact.citations.length > 0 && (
                        <div className="mt-3 border-t border-border/60 pt-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            Sources seen this run
                          </p>
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {artifact.citations.slice(0, 10).map((c) => (
                              <li key={c.url} className="truncate text-xs">
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-600 hover:underline dark:text-brand-400"
                                >
                                  {c.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
          {shown.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No tasks yet. Hit “Run today” — {displayName("atlas")} will file
              the first contracts.
            </div>
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Scorecard · 7 days
          </h2>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-muted-foreground">
                  <th className="py-1 font-semibold">role</th>
                  <th className="py-1 text-right font-semibold">tasks</th>
                  <th className="py-1 text-right font-semibold">verified</th>
                  <th className="py-1 text-right font-semibold">escalated</th>
                  <th className="py-1 text-right font-semibold">retries</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(([role, r]) => (
                  <tr key={role} className="border-t border-border/60">
                    <td className="py-1.5">
                      <Chip text={displayName(role)} style={ROLE_STYLE[role]} />
                    </td>
                    <td className="py-1.5 text-right">{r.total}</td>
                    <td className="py-1.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {r.verified}
                    </td>
                    <td className="py-1.5 text-right">{r.escalated}</td>
                    <td className="py-1.5 text-right">{r.retries}</td>
                  </tr>
                ))}
                {roles.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-2 text-xs text-muted-foreground"
                    >
                      Nothing to score yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <AlertTriangle size={13} /> Incidents
          </h2>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            {incidents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Clean record — no hallucinations, unsourced claims, or budget
                breaches on file.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {incidents.map((i) => (
                  <li key={String(i._id)} className="flex items-start gap-2">
                    <Chip
                      text={i.severity}
                      style={
                        i.severity === "high"
                          ? STATUS_STYLE.escalated
                          : i.severity === "medium"
                            ? STATUS_STYLE.blocked
                            : undefined
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">
                        [{displayName(i.role)}] {i.kind.replace("_", " ")} ·{" "}
                        {fmtDate(i.runDate)} · {fmtTime(i.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {i.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
