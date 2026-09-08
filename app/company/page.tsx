import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  ClipboardList,
  FileText,
  Gauge,
  HelpCircle,
  Inbox,
  PenSquare,
  Users2,
  Wrench,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import OrchestraRunButton from "@/components/orchestra-run-button";
import PostApprovalCard from "@/components/post-approval-card";
import EngRequestForm from "@/components/eng-request-form";
import RetroPanel, { type RetroProposal } from "@/components/retro-panel";
import Markdown from "@/components/markdown";
import OpsButton from "@/components/ops-button";
import SpendCapControl from "@/components/spend-cap-control";
import SpendResetHint from "@/components/spend-reset-hint";
import {
  Chip,
  EmptyState,
  Panel,
  QuietLink,
  ROLE_TONE,
  SectionTitle,
  StatTile,
  statusTone,
  Tabs,
} from "@/components/orchestra-ui";
import { api, convex } from "@/lib/convex/server";
import { dailyCapUsd, getCapOverride, resolveDailyCap } from "@/lib/orchestra/ledger";
import { fmtDate, fmtTime } from "@/lib/orchestra/format";
import { displayName, themeCodenames } from "@/lib/orchestra/registry";
import { todayDate } from "@/lib/orchestra/types";
import { isHosted } from "@/lib/hosted";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
// The Run-today server action can take minutes (hosted platforms honor this).
export const maxDuration = 300;

// /company — the orchestra's cockpit.
//
// Organising principle: ONE action zone, then reference material behind tabs.
// Everything that needs a human decision is above the fold and impossible to
// miss; everything that is merely true (the board, the scorecard, the incident
// log) is one click away instead of nine scroll-lengths down. The page used to
// stack nine equal-weight sections, which meant nothing had weight at all.

const TAB_IDS = ["today", "board", "health", "ops"] as const;
type TabId = (typeof TAB_IDS)[number];

export default async function CompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: TabId = (TAB_IDS as readonly string[]).includes(tab ?? "")
    ? (tab as TabId)
    : "today";

  const today = todayDate();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [
    todayReport,
    lastReport,
    tasks,
    scorecard,
    incidents,
    spend,
    forReview,
    approved,
    capOverride,
  ] = await Promise.all([
    convex().query(api.orchestra.latestReport, { runDate: today }),
    convex().query(api.orchestra.latestReport, {}),
    convex().query(api.orchestra.recentTasks, { limit: 30 }),
    convex().query(api.orchestra.scorecard, { sinceDate: since }),
    convex().query(api.orchestra.recentIncidents, {}),
    convex().query(api.orchestra.spendForDate, { runDate: today }),
    convex().query(api.orchestra.postsByStatus, { status: "queued_for_review" }),
    convex().query(api.orchestra.postsByStatus, { status: "approved" }),
    getCapOverride(),
  ]);
  const cap = await resolveDailyCap(today);
  const standingCap = dailyCapUsd();
  const capRaised = capOverride?.date === today;

  const retro = await convex().query(api.orchestra.latestArtifactOfKind, {
    kind: "retro",
  });
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
  const escalated = tasks.filter((t) => t.status === "escalated");
  const highIncidents = incidents.filter((i) => i.severity === "high");
  const needsYou = forReview.length + escalated.length;

  // Artifact bodies for the expandable board rows (bounded to what's shown).
  const shown = tasks.slice(0, 12);
  const artifacts = await Promise.all(
    shown.map((t) =>
      t.artifactId
        ? convex().query(api.orchestra.getArtifact, { artifactId: t.artifactId })
        : Promise.resolve(null),
    ),
  );
  const artifactByTask = new Map(shown.map((t, i) => [String(t._id), artifacts[i]]));

  const href = (id: string) => `/company?tab=${id}`;

  return (
    <div className="mx-auto max-w-6xl stagger-load">
      <PageHeader
        eyebrow="Orchestra"
        icon={<Bot size={14} />}
        title="Company"
        description={
          <>
            {displayName("atlas")} plans · {displayName("radar")} researches ·{" "}
            {displayName("sentinel")} verifies. Nothing external ships without
            you.{" "}
            {report ? (
              <span className="text-foreground/70">
                Last report {fmtDate(report.runDate)}.
              </span>
            ) : (
              "No runs yet - start the first one."
            )}
          </>
        }
        actions={
          <>
            <QuietLink href="/company/guide">
              <HelpCircle size={14} /> Guide
            </QuietLink>
            <QuietLink href="/company/studio">
              <PenSquare size={14} /> Studio
            </QuietLink>
            <QuietLink href="/company/team">
              <Users2 size={14} /> Team
            </QuietLink>
            <OrchestraRunButton alreadyRan={!!todayReport} />
          </>
        }
      />

      {/* ---- ACTION ZONE ---------------------------------------------------
          The only part of this page that asks something of you. It disappears
          entirely when there is nothing to decide, which is what makes its
          presence meaningful. */}
      {needsYou > 0 && (
        <section className="bezel mb-10">
          <div className="bezel-core overflow-hidden bg-gradient-to-br from-brand-500/[0.14] via-transparent to-transparent p-5 sm:p-7">
          <SectionTitle
            eyebrow="Needs you"
            icon={<Inbox size={12} />}
            title={`${needsYou} thing${needsYou === 1 ? "" : "s"} waiting on your call`}
            hint={
              forReview.length > 0
                ? "Drafts stop here until you approve them. Nothing posts itself."
                : "Work the team could not finish on its own."
            }
          />
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
            {escalated.length > 0 && (
              <Panel tone="danger">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={13} /> {escalated.length} escalated task
                  {escalated.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {escalated.slice(0, 4).map((t) => (
                    <li key={String(t._id)} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Chip className={ROLE_TONE[t.role]}>{displayName(t.role)}</Chip>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {themeCodenames(t.objective)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {fmtDate(t.runDate)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={href("board")}
                  className="mt-2 inline-block text-[12px] font-semibold text-rose-600 underline-offset-4 hover:underline dark:text-rose-400"
                >
                  Open the board →
                </Link>
              </Panel>
            )}
          </div>
          </div>
        </section>
      )}

      {/* ---- AMBIENT STATE -------------------------------------------------
          Four numbers that tell you whether the company is healthy, cheap and
          honest. Compact by design: they inform, they don't ask. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <StatTile
            label="Spend today"
            value={`$${spend.costUsd.toFixed(2)}`}
            tone={spend.costUsd >= cap ? "danger" : spend.costUsd > cap * 0.8 ? "warn" : "default"}
            meter={{ value: spend.costUsd, max: cap }}
            action={
              <SpendCapControl
                cap={cap}
                standingCap={standingCap}
                overridden={capRaised}
              />
            }
            sub={
              <>
                <p>
                  of ${cap.toFixed(2)}
                  {capRaised && (
                    <span className="ml-1 font-bold text-brand-600 dark:text-brand-400">
                      raised for today
                    </span>
                  )}{" "}
                  · {spend.calls} calls
                </p>
                <SpendResetHint />
              </>
            }
          />
        </div>
        <StatTile
          label="First-pass yield · 7d"
          value={
            totals.total
              ? `${Math.round((totals.verified / Math.max(1, totals.total)) * 100)}%`
              : "-"
          }
          meter={{ value: totals.verified, max: Math.max(1, totals.total), tone: "success" }}
          sub={`${totals.verified} verified of ${totals.total} tasks`}
        />
        <StatTile
          label="Escalated · 7d"
          value={String(totals.escalated)}
          tone={totals.escalated > 2 ? "warn" : "default"}
          sub={totals.retries ? `${totals.retries} retries` : "no retries"}
        />
        <StatTile
          label="Incidents"
          value={String(incidents.length)}
          tone={highIncidents.length ? "danger" : "default"}
          sub={
            highIncidents.length
              ? `${highIncidents.length} high severity`
              : "nothing severe on file"
          }
        />
      </div>

      {/* ---- REFERENCE ----------------------------------------------------- */}
      <div className="mt-8">
        <Tabs
          active={active}
          hrefFor={href}
          tabs={[
            { id: "today", label: "Today", count: approved.length, alert: approved.length > 0 },
            { id: "board", label: "Board", count: tasks.length },
            { id: "health", label: "Health", count: incidents.length, alert: highIncidents.length > 0 },
            { id: "ops", label: "Operations" },
          ]}
        />
      </div>

      <div className="mt-6 flex flex-col gap-8">
        {active === "today" && (
          <>
            {approved.length > 0 && (
              <section>
                <SectionTitle
                  eyebrow="Ready to post"
                  title={`${approved.length} approved, waiting on their day`}
                  hint="Copy each one when it's due, then mark it posted."
                />
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

            {report ? (
              <section>
                <SectionTitle
                  eyebrow={report.runDate === today ? "Today's report" : "Latest report"}
                  icon={<FileText size={12} />}
                  title={`${fmtDate(report.runDate)} · ${fmtTime(report.createdAt)}`}
                  hint={`Written by ${displayName("atlas")} at the end of the run.`}
                />
                <Panel>
                  <Markdown text={themeCodenames(report.body)} />
                </Panel>
              </section>
            ) : (
              <EmptyState
                icon={<Bot size={28} />}
                title="No runs yet"
                hint={`Hit "Run today" and ${displayName("atlas")} will file the first contracts, ${displayName("radar")} will research them, and ${displayName("sentinel")} will check the work before you see it.`}
              />
            )}

            {retro && (
              <section>
                <RetroPanel
                  runDate={retro.runDate}
                  memo={retroMemo}
                  proposals={retroProposals}
                />
              </section>
            )}
          </>
        )}

        {active === "board" && (
          <section>
            <SectionTitle
              eyebrow="Task board"
              icon={<ClipboardList size={12} />}
              title="Every contract, and what came back"
              hint="Each row is a brief written before the work started. Open one to see its definition of done, its budget, the deliverable, and the verifier's notes."
            />
            <div className="flex flex-col gap-2.5">
              {shown.map((t) => {
                const artifact = artifactByTask.get(String(t._id));
                return (
                  <details
                    key={String(t._id)}
                    className="group rounded-2xl border border-border/60 bg-card shadow-sm transition-all open:shadow-md"
                  >
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 px-4 py-3">
                      <Chip className={ROLE_TONE[t.role]}>{displayName(t.role)}</Chip>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {themeCodenames(t.objective)}
                      </span>
                      {t.verdict && (
                        <Chip tone={statusTone(t.verdict)}>{t.verdict}</Chip>
                      )}
                      <Chip tone={statusTone(t.status)}>{t.status.replace("_", " ")}</Chip>
                      <span className="text-[10px] font-bold text-muted-foreground/60">
                        {fmtDate(t.runDate)} · {fmtTime(t.updatedAt)}
                      </span>
                    </summary>
                    <div className="border-t border-border/50 px-4 py-4 text-sm">
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
                            ≤{t.budgets.maxOutputTokens.toLocaleString()} out-tokens · ≤
                            {t.budgets.maxToolCalls} tool calls · ≤${t.budgets.maxUsd} ·
                            attempt {t.attempts}
                          </p>
                          {t.verificationNotes && (
                            <>
                              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {displayName("sentinel")}&apos;s notes
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
                            <Chip>{artifact.kind}</Chip>
                            <Chip tone={statusTone(artifact.honestStatus)}>
                              {artifact.honestStatus}
                            </Chip>
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
                            <div className="mt-3 border-t border-border/50 pt-2">
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
                <EmptyState
                  icon={<ClipboardList size={26} />}
                  title="Nothing on the board"
                  hint={`Hit "Run today" - ${displayName("atlas")} files the first contracts.`}
                />
              )}
            </div>
          </section>
        )}

        {active === "health" && (
          <>
            <section>
              <SectionTitle
                eyebrow="Scorecard · 7 days"
                icon={<Gauge size={12} />}
                title="Who delivered, and who got sent back"
                hint="Verified means an independent check passed - never self-reported."
              />
              <Panel flush className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-secondary/30 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-bold">Employee</th>
                      <th className="px-3 py-2.5 text-right font-bold">Tasks</th>
                      <th className="px-3 py-2.5 text-right font-bold">Verified</th>
                      <th className="px-3 py-2.5 text-right font-bold">Escalated</th>
                      <th className="px-4 py-2.5 text-right font-bold">Retries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map(([role, r]) => (
                      <tr key={role} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-2.5">
                          <Chip className={ROLE_TONE[role]}>{displayName(role)}</Chip>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.total}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {r.verified}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.escalated}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.retries}</td>
                      </tr>
                    ))}
                    {roles.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-xs text-muted-foreground">
                          Nothing to score yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Panel>
            </section>

            <section>
              <SectionTitle
                eyebrow="Incidents"
                icon={<AlertTriangle size={12} />}
                title="Everything the verifier caught"
                hint="Unsourced claims, fabrications, parse failures. An empty list here is the goal; a long one is the system working."
              />
              {incidents.length === 0 ? (
                <EmptyState
                  title="Clean record"
                  hint="No hallucinations, unsourced claims, or budget breaches on file."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {incidents.map((i) => (
                    <Panel
                      key={String(i._id)}
                      tone={i.severity === "high" ? "danger" : i.severity === "medium" ? "warn" : "quiet"}
                      className="p-3.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip
                          tone={
                            i.severity === "high"
                              ? "danger"
                              : i.severity === "medium"
                                ? "warn"
                                : "default"
                          }
                        >
                          {i.severity}
                        </Chip>
                        <Chip className={ROLE_TONE[i.role]}>{displayName(i.role)}</Chip>
                        <span className="text-[12px] font-bold text-foreground">
                          {i.kind.replace("_", " ")}
                        </span>
                        <span className="ml-auto text-[10px] font-bold text-muted-foreground/70">
                          {fmtDate(i.runDate)} · {fmtTime(i.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                        {i.detail}
                      </p>
                    </Panel>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {active === "ops" && (
          <>
            <section>
              <SectionTitle
                eyebrow="Operations"
                icon={<Wrench size={12} />}
                title="Things you run by hand"
                hint="Each of these costs money and takes minutes. None of them run on their own except the weekly retro."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Panel>
                  <OpsButton
                    action="retro"
                    label="Run weekly retro"
                    className="w-full"
                    hint={`${displayName("atlas")} reviews the week - scorecards, incidents, your rejections - and proposes charter changes with evidence. Runs itself on Sundays; idempotent per week.`}
                  />
                </Panel>
                {/* Repo-bound tools (filesystem + git + tsc) exist only where the
                    server runs beside the repo - hidden on hosted deployments. */}
                {!isHosted() && (
                  <>
                    <Panel>
                      <OpsButton
                        action="forge"
                        label="Run Forge (spec queued requests)"
                        className="w-full"
                        hint={`${displayName("forge")} picks up the oldest eng request below, reads the actual codebase, and puts a spec with acceptance criteria on the board.`}
                      />
                    </Panel>
                    <Panel>
                      <OpsButton
                        action="probe"
                        label="Run Probe (review working tree)"
                        className="w-full"
                        hint={`After a spec is implemented: ${displayName("probe")} runs typecheck, then adversarially reviews your uncommitted changes against the spec.`}
                      />
                    </Panel>
                  </>
                )}
                <Panel tone="quiet">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Model tier &amp; calibration
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    The cost/quality dial and the golden-suite calibration live
                    on the Team page.
                  </p>
                  <QuietLink href="/company/team" className="mt-3">
                    <Users2 size={14} /> Open Team &amp; models
                  </QuietLink>
                </Panel>
              </div>
            </section>

            {!isHosted() && (
              <section>
                <EngRequestForm />
              </section>
            )}
          </>
        )}
      </div>

      <p
        className={cn(
          "mt-10 text-center text-[12px] text-muted-foreground",
          "border-t border-border/40 pt-6",
        )}
      >
        New here?{" "}
        <Link
          href="/company/guide"
          className="font-semibold text-brand-600 underline-offset-4 hover:underline dark:text-brand-400"
        >
          Read the guide
        </Link>{" "}
        for what each part does, and what only you can do.
      </p>
    </div>
  );
}
