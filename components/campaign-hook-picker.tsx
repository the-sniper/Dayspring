"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PenLine } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { chooseHooksAction } from "@/lib/actions/campaign";
import { startCampaignStage } from "@/lib/studio/kick";
import { cn } from "@/lib/utils";

// Checkpoint 2. The hook is the only line most readers will ever see, so it's
// the one decision that stays with you rather than being inferred from taste.
// "Let the writer choose" is a first-class option, not a skip.

const WRITER = -1;

export default function CampaignHookPicker({
  campaign,
}: {
  campaign: Doc<"orchCampaigns">;
}) {
  const [choice, setChoice] = useState<Record<string, number>>(
    Object.fromEntries(campaign.hooks.map((h) => [h.topicId, h.options.length ? 0 : WRITER])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const topicById = new Map(campaign.topics.map((t) => [t.id, t]));
  const briefById = new Map(campaign.briefs.map((b) => [b.topicId, b]));

  function confirm() {
    setError(null);
    startTransition(async () => {
      const r = await chooseHooksAction(
        campaign._id,
        campaign.hooks.map((h) => ({
          topicId: h.topicId,
          ...(choice[h.topicId] === WRITER ? {} : { index: choice[h.topicId] }),
        })),
      );
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
            Pick a hook for each post
          </h2>
          <p className="text-sm text-muted-foreground">
            Line one, verbatim. The writer builds the post around whatever you
            choose here.
          </p>
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
          Write the drafts
        </button>
      </div>
      {error && <p className="mb-3 text-xs font-semibold text-rose-500">{error}</p>}

      <div className="flex flex-col gap-4">
        {campaign.hooks.map((h) => {
          const topic = topicById.get(h.topicId);
          const brief = briefById.get(h.topicId);
          const thin = !brief || brief.status === "blocked";
          return (
            <div
              key={h.topicId}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">{topic?.title ?? h.topicId}</p>
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {topic?.pillar}
                </span>
                {thin && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    thin research — no outside claims
                  </span>
                )}
              </div>
              {brief && brief.keyStats.length > 0 && (
                <p className="mt-1.5 line-clamp-2 text-[12px] text-muted-foreground">
                  Research: {brief.keyStats.slice(0, 2).join(" · ")}
                </p>
              )}

              <ul className="mt-3 flex flex-col gap-2">
                {h.options.map((opt, i) => {
                  const on = choice[h.topicId] === i;
                  return (
                    <li key={`${h.topicId}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setChoice((c) => ({ ...c, [h.topicId]: i }))}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all",
                          on
                            ? "border-brand-500/50 bg-brand-500/[0.06]"
                            : "border-border/70 bg-background hover:border-brand-500/25",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            on ? "border-brand-500 bg-brand-500 text-white" : "border-border",
                          )}
                        >
                          {on && <Check size={11} strokeWidth={4} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {opt.type}
                          </span>
                          <span className="mt-0.5 block whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-foreground">
                            {opt.text}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={() => setChoice((c) => ({ ...c, [h.topicId]: WRITER }))}
                    className={cn(
                      "w-full rounded-xl border border-dashed p-2.5 text-center text-[12px] font-semibold transition-colors",
                      choice[h.topicId] === WRITER
                        ? "border-brand-500/50 bg-brand-500/[0.06] text-brand-600 dark:text-brand-400"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    None of these — let the writer choose
                  </button>
                </li>
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
