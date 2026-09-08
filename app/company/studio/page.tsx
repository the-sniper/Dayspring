import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Brain,
  CalendarDays,
  HelpCircle,
  History,
  LineChart,
  PenSquare,
  Plus,
  Users2,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import CampaignLauncher from "@/components/campaign-launcher";
import CampaignWorkspace from "@/components/campaign-workspace";
import MemoryQuickPanel from "@/components/memory-quick-panel";
import PostPerformancePanel, {
  type PerfPost,
} from "@/components/post-performance-panel";
import StrategyReviewPanel from "@/components/strategy-review-panel";
import {
  Chip,
  EmptyState,
  Panel,
  PrimaryLink,
  QuietLink,
  SectionTitle,
  statusTone,
  Tabs,
} from "@/components/orchestra-ui";
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

// /company/studio — the content pipeline.
//
// Organising principle: when a campaign is mid-flight, the checkpoint IS the
// job, so it gets the whole stage. Performance, strategy and memory are
// reference material and live behind tabs. The old layout gave all four equal
// billing in one long scroll, which buried the only thing actually waiting on
// a decision.

const TAB_IDS = ["campaign", "posts", "strategy", "memory"] as const;
type TabId = (typeof TAB_IDS)[number];

const STAGE_LABEL: Record<string, string> = {
  researching: "scouting",
  plan_ready: "your call",
  deep_research: "researching",
  hooks_ready: "your call",
  drafting: "drafting",
  drafts_ready: "your call",
  complete: "done",
  failed: "stopped",
};

const WAITING = new Set(["plan_ready", "hooks_ready", "drafts_ready"]);

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string; tab?: string }>;
}) {
  const { c: requested, new: forceNew, tab } = await searchParams;
  const activeTab: TabId = (TAB_IDS as readonly string[]).includes(tab ?? "")
    ? (tab as TabId)
    : "campaign";

  const [activeCampaigns, history, voice, lessons, posted, approved, strategy] =
    await Promise.all([
      convex().query(api.campaigns.active, {}),
      convex().query(api.campaigns.list, { limit: 10 }),
      getVoiceData(),
      getLessonsData(),
      convex().query(api.orchestra.postsForAnalysis, { limit: 30 }),
      convex().query(api.orchestra.postsByStatus, { status: "approved" }),
      convex().query(api.orchestra.latestArtifactOfKind, { kind: "strategy" }),
    ]);

  const active = requested
    ? await convex().query(api.campaigns.get, { campaignId: requested as never })
    : activeCampaigns[0]
      ? await convex().query(api.campaigns.get, {
          campaignId: activeCampaigns[0]._id,
        })
      : null;
  const showLauncher = !active || forceNew === "1";
  const waitingCount = activeCampaigns.filter((c) => WAITING.has(c.stage)).length;

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
  const unlogged = perfPosts.filter((p) => p.status !== "posted").length;

  let memo: string | null = null;
  let proposals: StrategyProposal[] = [];
  if (strategy) {
    const m = strategy.body.match(/```json\s*([\s\S]*?)```/);
    memo = m ? strategy.body.slice(0, m.index).trim() : strategy.body;
    // Models sometimes open the block with a bare ``` and label it in prose,
    // which leaves fence scaffolding dangling at the end of the readable memo.
    memo = memo
      .replace(/```[\s\S]*$/, "")
      .replace(/\n#*\s*(Memory Updates|kbUpdates:?)\s*$/i, "")
      .trim();
    if (m) {
      try {
        proposals =
          (JSON.parse(m[1]) as { proposals?: StrategyProposal[] }).proposals ?? [];
      } catch {
        // memo still renders; the proposals just lose their buttons
      }
    }
  }

  const href = (id: string) => {
    const params = new URLSearchParams();
    if (requested) params.set("c", requested);
    if (forceNew) params.set("new", forceNew);
    params.set("tab", id);
    return `/company/studio?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl stagger-load">
      <PageHeader
        eyebrow="Content Studio"
        icon={<PenSquare size={14} />}
        title="Content Studio"
        description={
          <>
            Campaigns across LinkedIn, X and Reddit. The team scouts, plans the
            schedule, researches, writes and edits. You decide three times, and
            nothing posts without you.
          </>
        }
        actions={
          <>
            <QuietLink href="/company/guide#studio">
              <HelpCircle size={14} /> Guide
            </QuietLink>
            <QuietLink href="/company">
              <ArrowLeft size={14} /> Board
            </QuietLink>
            <QuietLink href="/company/studio/calendar">
              <CalendarDays size={14} /> Calendar
            </QuietLink>
            {!showLauncher && (
              <PrimaryLink href="/company/studio?new=1">
                <Plus size={15} /> New campaign
              </PrimaryLink>
            )}
          </>
        }
      />

      {/* Campaign switcher. Several run at once, so which one you're looking at
          is an explicit choice, and the ones waiting on you say so. */}
      {activeCampaigns.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Live
          </span>
          {activeCampaigns.map((c) => {
            const on = active && String(active._id) === String(c._id) && !showLauncher;
            return (
              <Link
                key={String(c._id)}
                href={`/company/studio?c=${String(c._id)}`}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                  on
                    ? "border-brand-500/50 bg-brand-500/[0.07] text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="max-w-[14rem] truncate">{c.title}</span>
                <Chip tone={WAITING.has(c.stage) ? "warn" : statusTone(c.stage)}>
                  {STAGE_LABEL[c.stage] ?? c.stage}
                </Chip>
              </Link>
            );
          })}
          {showLauncher && activeCampaigns.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              or finish one of those
            </span>
          )}
        </div>
      )}

      <Tabs
        active={activeTab}
        hrefFor={href}
        tabs={[
          {
            id: "campaign",
            label: showLauncher ? "New campaign" : "Campaign",
            count: waitingCount,
            alert: waitingCount > 0,
          },
          { id: "posts", label: "Posts", count: unlogged, alert: unlogged > 0 },
          { id: "strategy", label: "Strategy" },
          { id: "memory", label: "Memory" },
        ]}
      />

      <div className="mt-6 flex flex-col gap-8">
        {activeTab === "campaign" && (
          <>
            {showLauncher ? (
              <CampaignLauncher pillars={voice.pillars} today={todayDate()} />
            ) : (
              <CampaignWorkspace campaignId={String(active!._id)} />
            )}

            {history.length > 0 && (
              <section>
                <SectionTitle
                  icon={<History size={12} />}
                  title="All campaigns"
                  hint="Everything that ran, what it approved, and what it cost."
                />
                <div className="flex flex-col gap-1.5">
                  {history.map((h) => (
                    <Link
                      key={String(h._id)}
                      href={`/company/studio?c=${String(h._id)}`}
                      className={cn(
                        "flex flex-wrap items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors",
                        active && String(active._id) === String(h._id)
                          ? "border-brand-500/40 bg-brand-500/[0.05]"
                          : "border-border/60 bg-card hover:bg-muted",
                      )}
                    >
                      <span className="w-20 shrink-0 text-[11px] font-bold text-muted-foreground/70">
                        {fmtDate(h.startDate)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {h.title}
                      </span>
                      <span className="hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 sm:inline">
                        {h.platforms.map((p) => platformSpec(p).short).join(" · ")}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {h.approved}/{h.drafts || h.slots || h.targetPosts} · $
                        {h.costUsd.toFixed(2)}
                      </span>
                      <Chip tone={WAITING.has(h.stage) ? "warn" : statusTone(h.stage)}>
                        {STAGE_LABEL[h.stage] ?? h.stage}
                      </Chip>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === "posts" && (
          <>
            <SectionTitle
              eyebrow="Posts"
              icon={<BarChart3 size={12} />}
              title="Approved, shipped, and what they did"
              hint="Copy a post on its day, put it live, then log the numbers here. That log is the only evidence the strategy review is allowed to reason from."
            />
            <PostPerformancePanel posts={perfPosts} />
          </>
        )}

        {activeTab === "strategy" && (
          <>
            <SectionTitle
              eyebrow="Strategy"
              icon={<LineChart size={12} />}
              title={`${displayName("pulse")}'s review`}
              hint="Reads what shipped, what it did, and what you rejected, then proposes memory edits you apply yourself. It can propose; only you can apply."
            />
            <StrategyReviewPanel
              memo={memo}
              proposals={proposals}
              runDate={strategy ? fmtDate(strategy.runDate) : null}
              analystName={displayName("pulse")}
            />
          </>
        )}

        {activeTab === "memory" && (
          <>
            <SectionTitle
              eyebrow="Memory"
              icon={<Brain size={12} />}
              title="What the team knows about you"
              hint="Read before every campaign. Anything the Studio can add, you can take back out, and the full editor (pillars, voice, story bank, banned topics) is on the Team page."
              action={
                <QuietLink href="/company/team">
                  <Users2 size={14} /> Full editor
                </QuietLink>
              }
            />
            {voice.pillars.length === 0 && voice.samples.length === 0 ? (
              <EmptyState
                icon={<Brain size={26} />}
                title="The team doesn't know your voice yet"
                hint="Set your pillars and paste 3-5 posts that sound like you. Everything the writers produce is calibrated against that."
                action={
                  <PrimaryLink href="/company/team">
                    <Users2 size={15} /> Set up voice &amp; memory
                  </PrimaryLink>
                }
              />
            ) : (
              <>
                <Panel tone="quiet" className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Pillars
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {voice.pillars.map((p) => (
                      <Chip key={p} tone="accent">
                        {p}
                      </Chip>
                    ))}
                  </div>
                  <p className="mt-3 text-[12px] text-muted-foreground">
                    {voice.stories.length} story-bank entr
                    {voice.stories.length === 1 ? "y" : "ies"} ·{" "}
                    {voice.dos.length} do{voice.dos.length === 1 ? "" : "s"} ·{" "}
                    {voice.donts.length} don&apos;t
                    {voice.donts.length === 1 ? "" : "s"}
                  </p>
                </Panel>
                <MemoryQuickPanel
                  lessons={lessons.lessons.map((l) => ({ date: l.date, text: l.text }))}
                  samples={voice.samples.map((s) => ({
                    text: s.text,
                    performance: s.performance ?? null,
                  }))}
                />
              </>
            )}
          </>
        )}
      </div>

      <p className="mt-10 border-t border-border/40 pt-6 text-center text-[12px] text-muted-foreground">
        Not sure what happens next?{" "}
        <Link
          href="/company/guide#studio"
          className="font-semibold text-brand-600 underline-offset-4 hover:underline dark:text-brand-400"
        >
          Read the Studio guide
        </Link>
        .
      </p>
    </div>
  );
}
