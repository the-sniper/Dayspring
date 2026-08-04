import Link from "next/link";
import { ArrowLeft, CalendarDays, PenSquare, Plus, Users2 } from "lucide-react";
import PageHeader from "@/components/page-header";
import CampaignLauncher from "@/components/campaign-launcher";
import CampaignWorkspace from "@/components/campaign-workspace";
import MemoryQuickPanel from "@/components/memory-quick-panel";
import PostPerformancePanel, {
  type PerfPost,
} from "@/components/post-performance-panel";
import StrategyReviewPanel from "@/components/strategy-review-panel";
import { api, convex } from "@/lib/convex/server";
import { fmtDate } from "@/lib/orchestra/format";
import { getLessonsData, getVoiceData } from "@/lib/orchestra/memory";
import { displayName } from "@/lib/orchestra/registry";
import type { StrategyProposal } from "@/lib/orchestra/strategy";
import { todayDate } from "@/lib/orchestra/types";
import { platformSpec } from "@/shared/platforms";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// /company/studio — the GTM team's content pipeline, run from here rather than
// from a terminal. Several campaigns can be live at once; the switcher picks
// which one the workspace shows.

const STAGE_LABEL: Record<string, string> = {
  researching: "scouting",
  plan_ready: "waiting on you",
  deep_research: "researching",
  hooks_ready: "waiting on you",
  drafting: "drafting",
  drafts_ready: "waiting on you",
  complete: "done",
  failed: "stopped",
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const { c: requested, new: forceNew } = await searchParams;

  const [activeCampaigns, history, voice, lessons, posted, approved, strategy] =
    await Promise.all([
      convex().query(api.campaigns.active, {}),
      convex().query(api.campaigns.list, { limit: 8 }),
      getVoiceData(),
      getLessonsData(),
      convex().query(api.orchestra.postsForAnalysis, { limit: 30 }),
      convex().query(api.orchestra.postsByStatus, { status: "approved" }),
      convex().query(api.orchestra.latestArtifactOfKind, { kind: "strategy" }),
    ]);

  const active =
    requested
      ? await convex().query(api.campaigns.get, { campaignId: requested as never })
      : activeCampaigns[0]
        ? await convex().query(api.campaigns.get, {
            campaignId: activeCampaigns[0]._id,
          })
        : null;
  const showLauncher = !active || forceNew === "1";

  // Approved-but-unlogged posts belong in the performance list too — that's
  // where "I posted it, here's what happened" gets typed in.
  const perfPosts: PerfPost[] = [
    ...approved.map((p) => ({
      id: String(p._id),
      platform: p.platform,
      status: p.status,
      pillar: p.pillar ?? null,
      hookType: p.hookType ?? null,
      topicTitle: p.topicTitle ?? null,
      angle: p.angle,
      title: p.title ?? null,
      channel: p.channel ?? null,
      text: p.text,
      scheduledFor: p.scheduledFor ?? null,
      postedAt: p.decidedAt ?? p.createdAt,
      image: p.image ?? null,
      history: (p.history ?? []).map((h) => ({
        text: h.text,
        title: h.title ?? null,
        at: h.at,
        by: h.by,
      })),
      metrics: null,
    })),
    ...posted.map((p) => ({
      id: p.id,
      platform: p.platform,
      status: "posted",
      pillar: p.pillar,
      hookType: p.hookType,
      topicTitle: p.topicTitle,
      angle: p.angle,
      title: null,
      channel: null,
      text: p.text,
      scheduledFor: null,
      postedAt: p.postedAt,
      image: null,
      history: [],
      metrics: p.metrics,
    })),
  ];

  // The review artifact carries its proposals in a trailing json block, the
  // same convention the weekly retro uses.
  let memo: string | null = null;
  let proposals: StrategyProposal[] = [];
  if (strategy) {
    const m = strategy.body.match(/```json\s*([\s\S]*?)```/);
    memo = m ? strategy.body.slice(0, m.index).trim() : strategy.body;
    // Models sometimes open the block with a bare ``` and label it in prose,
    // which leaves fence scaffolding dangling at the end of the readable memo.
    memo = memo.replace(/```[\s\S]*$/, "").replace(/\n#*\s*(Memory Updates|kbUpdates:?)\s*$/i, "").trim();
    if (m) {
      try {
        proposals =
          (JSON.parse(m[1]) as { proposals?: StrategyProposal[] }).proposals ?? [];
      } catch {
        // memo still renders; the proposals just lose their buttons
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl stagger-load">
      <PageHeader
        eyebrow="Orchestra"
        icon={<PenSquare size={14} />}
        title="Content Studio"
        description={
          <>
            {displayName("radar")} scouts · {displayName("compass")} plans the
            week · {displayName("delve")} researches · {displayName("spark")}{" "}
            hooks · {displayName("quill")} writes · {displayName("hone")} edits ·{" "}
            {displayName("easel")} briefs the image · {displayName("sentinel")}{" "}
            audits. LinkedIn, X and Reddit. Nothing posts without you.
          </>
        }
        actions={
          <>
            <Link
              href="/company/studio/calendar"
              className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              <CalendarDays size={14} /> Calendar
            </Link>
            <Link
              href="/company"
              className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft size={14} /> Board
            </Link>
            <Link
              href="/company/team"
              className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              <Users2 size={14} /> Voice &amp; memory
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-8">
        {/* Campaign switcher — several can run at once, so which one you're
            looking at has to be an explicit choice, not an assumption. */}
        {activeCampaigns.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Live campaigns
            </span>
            {activeCampaigns.map((c) => (
              <Link
                key={String(c._id)}
                href={`/company/studio?c=${String(c._id)}`}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active && String(active._id) === String(c._id) && !showLauncher
                    ? "border-brand-500/50 bg-brand-500/[0.07] text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {c.title}
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                  {STAGE_LABEL[c.stage] ?? c.stage}
                </span>
              </Link>
            ))}
            <Link
              href="/company/studio?new=1"
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              <Plus size={13} /> New
            </Link>
          </div>
        )}

        {showLauncher ? (
          <CampaignLauncher pillars={voice.pillars} today={todayDate()} />
        ) : (
          <CampaignWorkspace campaignId={String(active!._id)} />
        )}

        {history.length > 0 && (
          <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              All campaigns
            </h2>
            <ul className="flex flex-col gap-1.5">
              {history.map((h) => (
                <li key={String(h._id)}>
                  <Link
                    href={`/company/studio?c=${String(h._id)}`}
                    className={cn(
                      "flex flex-wrap items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors",
                      active && String(active._id) === String(h._id)
                        ? "border-brand-500/40 bg-brand-500/[0.05]"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <span className="text-[11px] font-bold text-muted-foreground/60">
                      {fmtDate(h.startDate)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {h.title}
                    </span>
                    <span className="hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 sm:inline">
                      {h.platforms.map((p) => platformSpec(p).short).join(" · ")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {h.approved}/{h.drafts || h.slots || h.targetPosts} approved · $
                      {h.costUsd.toFixed(2)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        h.stage === "failed"
                          ? "bg-rose-500/10 text-rose-500"
                          : h.stage === "complete"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {STAGE_LABEL[h.stage] ?? h.stage}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <PostPerformancePanel posts={perfPosts} />

        <StrategyReviewPanel
          memo={memo}
          proposals={proposals}
          runDate={strategy ? fmtDate(strategy.runDate) : null}
          analystName={displayName("pulse")}
        />

        <MemoryQuickPanel
          lessons={lessons.lessons.map((l) => ({ date: l.date, text: l.text }))}
          samples={voice.samples.map((s) => ({
            text: s.text,
            performance: s.performance ?? null,
          }))}
        />
      </div>
    </div>
  );
}
