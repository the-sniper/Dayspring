"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { AlertTriangle, Check, Loader2, RefreshCw, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import CampaignCalendar from "@/components/campaign-calendar";
import CampaignDraftReview from "@/components/campaign-draft-review";
import CampaignHookPicker from "@/components/campaign-hook-picker";
import CampaignTopicPicker from "@/components/campaign-topic-picker";
import { finishCampaignAction } from "@/lib/actions/campaign";
import { displayName } from "@/lib/orchestra/registry";
import { startCampaignStage } from "@/lib/studio/kick";
import { cn } from "@/lib/utils";

// The live campaign view. Everything here reads from the Convex subscription on
// the campaign row, so a background stage finishing updates the page with no
// polling — and a reload mid-stage lands exactly where the work actually is.

const STAGES: { key: string; label: string; who: string }[] = [
  { key: "researching", label: "Scouting topics", who: "radar" },
  { key: "topics_ready", label: "You pick topics", who: "" },
  { key: "deep_research", label: "Research & hooks", who: "delve" },
  { key: "hooks_ready", label: "You pick hooks", who: "" },
  { key: "drafting", label: "Draft · edit · audit", who: "quill" },
  { key: "drafts_ready", label: "You approve", who: "" },
  { key: "complete", label: "Scheduled", who: "" },
];

const RUNNING = new Set(["researching", "deep_research", "drafting"]);
const STALE_MS = 12 * 60_000;

// What each running stage is actually doing, so a three-minute wait reads as
// work rather than as a hang.
const RUNNING_DETAIL: Record<string, string[]> = {
  researching: [
    "searching the web for this week's candidates",
    "merging your ideas in and ranking the shortlist",
  ],
  deep_research: [
    "one researcher per topic, all at once",
    "then five hooks per topic in a single pass",
  ],
  drafting: [
    "one writer per post, all at once",
    "then one editing pass, then the verifier",
  ],
};

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function StageRail({ stage }: { stage: string }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {STAGES.map((s, i) => {
        const done = idx > i;
        const now = idx === i;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                now
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : done
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-secondary text-muted-foreground/60",
              )}
            >
              {done ? (
                <Check size={11} strokeWidth={3.5} />
              ) : now && RUNNING.has(s.key) ? (
                <Loader2 size={11} className="animate-spin" />
              ) : null}
              {s.label}
            </span>
            {i < STAGES.length - 1 && (
              <span className="h-px w-3 bg-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function RunningPanel({
  stage,
  stageStartedAt,
  onResume,
}: {
  stage: string;
  stageStartedAt: string;
  onResume: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Date.now() - Date.parse(stageStartedAt);
  const stalled = elapsed > STALE_MS;
  const detail = RUNNING_DETAIL[stage] ?? [];

  return (
    <div className="rounded-[2rem] border border-border/60 bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]/10">
        {stalled ? (
          <AlertTriangle size={22} className="text-rose-500" />
        ) : (
          <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
        )}
      </div>
      <p className="mt-4 font-display text-lg font-bold text-foreground">
        {stalled ? "This stage stopped responding" : "The team is working"}
      </p>
      <ul className="mt-2 flex flex-col gap-0.5 text-sm text-muted-foreground">
        {detail.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] font-medium text-muted-foreground/70">
        {ago(elapsed)} elapsed · this page updates itself, you can leave it
      </p>
      {stalled && (
        <button
          type="button"
          onClick={onResume}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted"
        >
          <RefreshCw size={13} /> Run this stage again
        </button>
      )}
    </div>
  );
}

export default function CampaignWorkspace({
  campaignId,
}: {
  campaignId: string;
}) {
  const campaign = useQuery(api.campaigns.get, {
    campaignId: campaignId as Id<"orchCampaigns">,
  });
  const [kickError, setKickError] = useState<string | null>(null);
  const router = useRouter();

  // The campaign row is live, but the page around it (history strip, spend,
  // the approved-post queue) is server-rendered. When a background stage
  // finishes, refresh those too — otherwise the strip below keeps insisting
  // the campaign is still drafting.
  const stage = campaign?.stage;
  useEffect(() => {
    if (stage) router.refresh();
  }, [stage, router]);

  async function resume(retry = false) {
    setKickError(null);
    const r = await startCampaignStage(campaignId, { retry });
    if (!r.ok) setKickError(r.error ?? "Could not start the stage.");
    router.refresh();
  }

  if (campaign === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 size={15} className="animate-spin" /> Loading campaign…
      </div>
    );
  }
  if (campaign === null) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        That campaign is gone.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border/60 bg-card px-5 py-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-lg font-bold tracking-tight text-foreground">
            {campaign.title}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-muted-foreground">
              {campaign.runDate} · ${campaign.costUsd.toFixed(2)} spent
            </span>
            {campaign.stage !== "complete" && (
              <button
                type="button"
                onClick={() => void finishCampaignAction(campaignId).then(() => router.refresh())}
                title="Abandon this campaign"
                className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <StageRail stage={campaign.stage} />
      </div>

      {kickError && (
        <p className="text-xs font-semibold text-rose-500">{kickError}</p>
      )}

      {campaign.stage === "failed" && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.05] p-5">
          <p className="flex items-center gap-2 font-semibold text-rose-600 dark:text-rose-400">
            <AlertTriangle size={16} /> The campaign stopped
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/80">
            {campaign.error ?? "No reason recorded."}
          </p>
          <button
            type="button"
            onClick={() => void resume(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105"
          >
            <RefreshCw size={13} /> Retry that stage
          </button>
        </div>
      )}

      {RUNNING.has(campaign.stage) && (
        <RunningPanel
          stage={campaign.stage}
          stageStartedAt={campaign.stageStartedAt}
          onResume={() => void resume()}
        />
      )}

      {campaign.stage === "topics_ready" && (
        <CampaignTopicPicker campaign={campaign} />
      )}
      {campaign.stage === "hooks_ready" && (
        <CampaignHookPicker campaign={campaign} />
      )}
      {(campaign.stage === "drafts_ready" || campaign.stage === "complete") &&
        campaign.drafts.length > 0 && (
          <>
            <CampaignDraftReview campaign={campaign} />
            <CampaignCalendar campaign={campaign} />
          </>
        )}

      {campaign.stage === "complete" && campaign.drafts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          This campaign was closed before it produced drafts.
        </div>
      )}

      {campaign.topics.length > 0 && campaign.stage !== "topics_ready" && (
        <details className="rounded-2xl border border-border/60 bg-card p-4">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Shortlist from {displayName("compass")} ({campaign.topics.length}) —
            the ones you didn't pick are still here
          </summary>
          <ul className="mt-3 flex flex-col gap-1.5">
            {campaign.topics.map((t) => (
              <li
                key={t.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 text-[13px]",
                  campaign.selectedTopicIds.includes(t.id)
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <span className="text-[10px] font-bold text-muted-foreground/50">
                  #{t.rank}
                </span>
                {campaign.selectedTopicIds.includes(t.id) && (
                  <Check size={12} className="text-emerald-500" strokeWidth={3} />
                )}
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  {t.pillar}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
