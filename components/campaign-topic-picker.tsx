"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { selectTopicsAction } from "@/lib/actions/campaign";
import { startCampaignStage } from "@/lib/studio/kick";
import { cn } from "@/lib/utils";

// Checkpoint 1. The whole shortlist is shown ranked; you pick what gets
// written. Unpicked topics stay on the campaign record — nothing is lost, and
// a good topic that missed this week is still there to look at.

const FORMAT_LABEL: Record<string, string> = {
  standard: "Standard",
  "hot-topic": "🔥 Hot topic",
  "brand-case-study": "📦 Case study",
};

const FORMAT_STYLE: Record<string, string> = {
  standard: "bg-secondary text-muted-foreground",
  "hot-topic": "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "brand-case-study": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export default function CampaignTopicPicker({
  campaign,
}: {
  campaign: Doc<"orchCampaigns">;
}) {
  // Pre-select the top N — the common case is "yes, those" with one swap.
  const [picked, setPicked] = useState<Set<string>>(
    new Set(campaign.topics.slice(0, campaign.targetPosts).map((t) => t.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const r = await selectTopicsAction(campaign._id, [...picked]);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      await startCampaignStage(campaign._id);
      router.refresh();
    });
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
            Pick this week's topics
          </h2>
          <p className="text-sm text-muted-foreground">
            {campaign.topics.length} shortlisted · {picked.size} selected ·
            researching each pick costs about a cent.
          </p>
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={pending || picked.size === 0}
          className="flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={3} />}
          Research {picked.size || ""} topic{picked.size === 1 ? "" : "s"}
        </button>
      </div>
      {error && <p className="mb-3 text-xs font-semibold text-rose-500">{error}</p>}

      <ul className="flex flex-col gap-2.5">
        {campaign.topics.map((t) => {
          const on = picked.has(t.id);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className={cn(
                  "w-full rounded-2xl border p-4 text-left transition-all",
                  on
                    ? "border-brand-500/50 bg-brand-500/[0.06] shadow-[0_8px_24px_-16px_rgba(245,158,11,0.6)]"
                    : "border-border bg-card hover:border-brand-500/25",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      on
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-border bg-background",
                    )}
                  >
                    {on && <Check size={13} strokeWidth={3.5} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground/50">
                        #{t.rank}
                      </span>
                      <p className="font-semibold text-foreground">{t.title}</p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          FORMAT_STYLE[t.format] ?? FORMAT_STYLE.standard,
                        )}
                      >
                        {FORMAT_LABEL[t.format] ?? t.format}
                      </span>
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        {t.pillar}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {t.source}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-foreground/80">
                      <span className="font-semibold text-foreground">Your angle: </span>
                      {t.angle}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold">Why now: </span>
                      {t.whyNow}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
