"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PenLine } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { chooseHooksAction } from "@/lib/actions/campaign";
import { startCampaignStage } from "@/lib/studio/kick";
import { platformSpec } from "@/shared/platforms";
import { cn } from "@/lib/utils";

// Checkpoint 2. Hooks are per SLOT, not per topic: the line that works on X is
// not the line that works as a Reddit title, even for the same idea.

const WRITER = -1;

const PLATFORM_STYLE: Record<string, string> = {
  linkedin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  x: "bg-stone-500/10 text-stone-600 dark:text-stone-300",
  reddit: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

export default function CampaignHookPicker({
  campaign,
}: {
  campaign: Doc<"orchCampaigns">;
}) {
  const [choice, setChoice] = useState<Record<string, number>>(
    Object.fromEntries(
      campaign.hooks.map((h) => [
        h.slotId ?? h.topicId,
        h.options.length ? 0 : WRITER,
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const topicById = new Map(campaign.topics.map((t) => [t.id, t]));
  const briefById = new Map(campaign.briefs.map((b) => [b.topicId, b]));
  const slotById = new Map((campaign.plan ?? []).map((s) => [s.slotId, s]));

  function confirm() {
    setError(null);
    startTransition(async () => {
      const r = await chooseHooksAction(
        campaign._id,
        campaign.hooks.map((h) => {
          const key = h.slotId ?? h.topicId;
          return {
            slotId: key,
            ...(choice[key] === WRITER ? {} : { index: choice[key] }),
          };
        }),
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
            Line one, verbatim (the title, on Reddit). The writer builds the
            post around whatever you choose.
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
          const key = h.slotId ?? h.topicId;
          const slot = h.slotId ? slotById.get(h.slotId) : undefined;
          const topic = topicById.get(h.topicId);
          const brief = briefById.get(h.topicId);
          const thin = !brief || brief.status === "blocked";
          const platform = slot?.platform ?? campaign.platform ?? "linkedin";
          return (
            <div
              key={key}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    PLATFORM_STYLE[platform] ?? PLATFORM_STYLE.linkedin,
                  )}
                >
                  {platformSpec(platform).label}
                </span>
                {slot?.channel && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {slot.channel}
                  </span>
                )}
                {slot?.date && (
                  <span className="text-[11px] font-bold text-muted-foreground">
                    {slot.date}
                  </span>
                )}
                <p className="min-w-0 flex-1 truncate font-semibold text-foreground">
                  {topic?.title ?? h.topicId}
                </p>
                {thin && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    thin research — no outside claims
                  </span>
                )}
              </div>
              {slot?.treatment && (
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Treatment: </span>
                  {slot.treatment}
                </p>
              )}

              <ul className="mt-3 flex flex-col gap-2">
                {h.options.map((opt, i) => {
                  const on = choice[key] === i;
                  return (
                    <li key={`${key}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setChoice((c) => ({ ...c, [key]: i }))}
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
                    onClick={() => setChoice((c) => ({ ...c, [key]: WRITER }))}
                    className={cn(
                      "w-full rounded-xl border border-dashed p-2.5 text-center text-[12px] font-semibold transition-colors",
                      choice[key] === WRITER
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
