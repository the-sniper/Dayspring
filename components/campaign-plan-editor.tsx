"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Image as ImageIcon, Loader2, Save } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { savePlanAction, type PlanSlotInput } from "@/lib/actions/campaign";
import { startCampaignStage } from "@/lib/studio/kick";
import { PLATFORMS, platformSpec } from "@/shared/platforms";
import { cn } from "@/lib/utils";

// Checkpoint 1 — the schedule, not a topic list. The team proposes when each
// topic runs and on which surface; you switch slots off, move dates, retarget
// subreddits, and decide which posts want an image. Only enabled slots get
// researched, so switching one off is also how you control spend.

const PLATFORM_STYLE: Record<string, string> = {
  linkedin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  x: "bg-stone-500/10 text-stone-600 dark:text-stone-300",
  reddit: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function CampaignPlanEditor({
  campaign,
}: {
  campaign: Doc<"orchCampaigns">;
}) {
  const [slots, setSlots] = useState<PlanSlotInput[]>(
    (campaign.plan ?? []).map((s) => ({
      slotId: s.slotId,
      date: s.date,
      platform: s.platform,
      channel: s.channel ?? "",
      topicId: s.topicId,
      treatment: s.treatment,
      wantsImage: s.wantsImage,
      enabled: s.enabled,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const topicById = useMemo(
    () => new Map(campaign.topics.map((t) => [t.id, t])),
    [campaign.topics],
  );
  const live = slots.filter((s) => s.enabled);
  const platforms = campaign.platforms ?? [campaign.platform ?? "linkedin"];

  function patch(slotId: string, changes: Partial<PlanSlotInput>) {
    setSlots((prev) =>
      prev.map((s) => (s.slotId === slotId ? { ...s, ...changes } : s)),
    );
    setSaved(null);
  }

  function save(start: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await savePlanAction(campaign._id, slots, start);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      if (start) {
        await startCampaignStage(campaign._id);
      } else {
        setSaved(r.message);
      }
      router.refresh();
    });
  }

  const sorted = [...slots].sort(
    (a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform),
  );

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
            The schedule
          </h2>
          <p className="text-sm text-muted-foreground">
            {live.length} of {slots.length} slot(s) on ·{" "}
            {campaign.startDate ?? campaign.runDate} →{" "}
            {campaign.endDate ?? campaign.runDate} ·{" "}
            {platforms.map((p) => platformSpec(p).label).join(", ")}. Only the
            slots you leave on get researched and written.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => save(false)}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Save size={14} /> Save
          </button>
          <button
            type="button"
            disabled={pending || live.length === 0}
            onClick={() => save(true)}
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={3} />}
            Research {live.length} slot{live.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
      {error && <p className="mb-3 text-xs font-semibold text-rose-500">{error}</p>}
      {saved && <p className="mb-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{saved}</p>}

      <ul className="flex flex-col gap-2.5">
        {sorted.map((s) => {
          const topic = topicById.get(s.topicId);
          const spec = platformSpec(s.platform);
          return (
            <li
              key={s.slotId}
              className={cn(
                "rounded-2xl border p-4 transition-all",
                s.enabled
                  ? "border-border bg-card"
                  : "border-dashed border-border/70 bg-card/40 opacity-55",
              )}
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => patch(s.slotId, { enabled: !s.enabled })}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    s.enabled
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-border bg-background",
                  )}
                  aria-label={s.enabled ? "Switch this slot off" : "Switch this slot on"}
                >
                  {s.enabled && <Check size={13} strokeWidth={3.5} />}
                </button>

                <input
                  type="date"
                  value={s.date}
                  onChange={(e) => patch(s.slotId, { date: e.target.value })}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground focus:border-brand-500/50 focus:outline-none"
                />
                <span className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {dayLabel(s.date)}
                </span>

                <select
                  value={s.platform}
                  onChange={(e) =>
                    patch(s.slotId, {
                      platform: e.target.value,
                      channel: e.target.value === "reddit" ? s.channel : "",
                      wantsImage: PLATFORMS[e.target.value as keyof typeof PLATFORMS]?.imageTypical
                        ? s.wantsImage
                        : false,
                    })
                  }
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider focus:outline-none",
                    PLATFORM_STYLE[s.platform] ?? PLATFORM_STYLE.linkedin,
                  )}
                >
                  {platforms.map((p) => (
                    <option key={p} value={p}>
                      {platformSpec(p).label}
                    </option>
                  ))}
                </select>

                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                  {topic?.title ?? s.topicId}
                </p>

                <button
                  type="button"
                  onClick={() => patch(s.slotId, { wantsImage: !s.wantsImage })}
                  title={s.wantsImage ? "Image brief will be written" : "No image"}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                    s.wantsImage
                      ? "border-brand-500/40 bg-brand-500/10 text-brand-600 dark:text-brand-400"
                      : "border-border text-muted-foreground/60 hover:bg-muted",
                  )}
                >
                  <ImageIcon size={11} /> {s.wantsImage ? "image" : "no image"}
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-7">
                {spec.channelLabel && (
                  <input
                    value={s.channel ?? ""}
                    onChange={(e) => patch(s.slotId, { channel: e.target.value })}
                    placeholder="r/Subreddit"
                    className="w-44 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:border-brand-500/50 focus:outline-none"
                  />
                )}
                {topic && (
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    {topic.pillar}
                  </span>
                )}
              </div>

              <p className="mt-2 pl-7 text-[12px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Treatment: </span>
                {s.treatment}
              </p>
            </li>
          );
        })}
        {slots.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            The planner returned no slots. Retry the stage, or start a campaign
            with a wider date range.
          </li>
        )}
      </ul>

      <details className="mt-4 rounded-2xl border border-border/60 bg-card p-4">
        <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <CalendarDays size={12} className="mr-1.5 inline" />
          The full shortlist ({campaign.topics.length}) — everything the scout
          found, including what didn't get a slot
        </summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          {campaign.topics.map((t) => {
            const used = slots.some((s) => s.enabled && s.topicId === t.id);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-[10px] font-bold text-muted-foreground/50">#{t.rank}</span>
                {used && <Check size={12} className="text-emerald-500" strokeWidth={3} />}
                <span className={cn("min-w-0 flex-1 truncate", used ? "text-foreground" : "text-muted-foreground")}>
                  {t.title}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  {t.pillar}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
