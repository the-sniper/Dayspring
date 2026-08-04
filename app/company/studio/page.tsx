import Link from "next/link";
import { ArrowLeft, PenSquare, Users2 } from "lucide-react";
import PageHeader from "@/components/page-header";
import CampaignLauncher from "@/components/campaign-launcher";
import CampaignWorkspace from "@/components/campaign-workspace";
import PostPerformancePanel, {
  type PerfPost,
} from "@/components/post-performance-panel";
import StrategyReviewPanel from "@/components/strategy-review-panel";
import { api, convex } from "@/lib/convex/server";
import { fmtDate } from "@/lib/orchestra/format";
import { getVoiceData } from "@/lib/orchestra/memory";
import { displayName } from "@/lib/orchestra/registry";
import type { StrategyProposal } from "@/lib/orchestra/strategy";
import { todayDate } from "@/lib/orchestra/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// /company/studio — the GTM team's content pipeline, run from here rather than
// from a terminal. The campaign itself is a live Convex subscription
// (CampaignWorkspace); everything around it is ordinary server rendering.

const STAGE_LABEL: Record<string, string> = {
  researching: "scouting",
  topics_ready: "waiting on you",
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

  const [latest, history, voice, posted, approved, strategy] = await Promise.all([
    convex().query(api.campaigns.latest, {}),
    convex().query(api.campaigns.list, { limit: 8 }),
    getVoiceData(),
    convex().query(api.orchestra.postsForAnalysis, { limit: 30 }),
    convex().query(api.orchestra.postsByStatus, { status: "approved" }),
    convex().query(api.orchestra.latestArtifactOfKind, { kind: "strategy" }),
  ]);

  const active =
    requested
      ? await convex().query(api.campaigns.get, { campaignId: requested as never })
      : latest && latest.stage !== "complete"
        ? latest
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
      text: p.text,
      postedAt: p.decidedAt ?? p.createdAt,
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
      text: p.text,
      postedAt: p.postedAt,
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
            {displayName("radar")} scouts · {displayName("compass")} ranks ·{" "}
            {displayName("delve")} researches · {displayName("spark")} hooks ·{" "}
            {displayName("quill")} writes · {displayName("hone")} edits ·{" "}
            {displayName("sentinel")} audits. You decide three times; nothing
            posts without you.
          </>
        }
        actions={
          <>
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
        {showLauncher ? (
          <CampaignLauncher
            pillars={voice.pillars}
            defaultTitle={`Content week of ${todayDate()}`}
          />
        ) : (
          <CampaignWorkspace campaignId={String(active!._id)} />
        )}

        {!showLauncher && (
          <div>
            <Link
              href="/company/studio?new=1"
              className="text-[12px] font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Start a different campaign instead
            </Link>
          </div>
        )}

        {history.length > 0 && (
          <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Campaigns
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
                      {fmtDate(h.runDate)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {h.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {h.approved}/{h.drafts || h.targetPosts} approved · $
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
      </div>
    </div>
  );
}
