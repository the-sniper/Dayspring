"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Loader2 } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  finishCampaignAction,
  moveScheduleAction,
  scheduleCampaignAction,
} from "@/lib/actions/campaign";
import { cn } from "@/lib/utils";

// The content calendar. Dates are assigned by code (weekdays, pillars
// interleaved) and then editable — the schedule is a suggestion you can
// overrule, not a commitment the system makes for you.

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function CampaignCalendar({
  campaign,
}: {
  campaign: Doc<"orchCampaigns">;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const live = campaign.drafts.filter((d) => d.decision !== "skipped");
  const scheduled = live.filter((d) => d.scheduledFor);
  const allDecided = campaign.drafts.every((d) => d.decision);

  function act(fn: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message);
      router.refresh();
    });
  }

  if (!live.length) return null;

  return (
    <section className="rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-foreground">
            <CalendarDays size={18} className="text-brand-500" /> Content calendar
          </h2>
          <p className="text-sm text-muted-foreground">
            Weekdays only, same pillar never back to back. Change any date.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => scheduleCampaignAction(campaign._id))}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <CalendarDays size={13} />}
            {scheduled.length ? "Re-plan dates" : "Plan the dates"}
          </button>
          {allDecided && campaign.stage !== "complete" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => finishCampaignAction(campaign._id))}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105 disabled:opacity-50"
            >
              <Check size={13} strokeWidth={3} /> Close campaign
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-rose-500">{error}</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {[...live]
          .sort((a, b) => (a.scheduledFor ?? "9").localeCompare(b.scheduledFor ?? "9"))
          .map((d) => (
            <li
              key={d.topicId}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-2.5"
            >
              <input
                type="date"
                value={d.scheduledFor ?? ""}
                onChange={(e) =>
                  act(() => moveScheduleAction(campaign._id, d.topicId, e.target.value))
                }
                className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground focus:border-brand-500/50 focus:outline-none"
              />
              <span className="w-28 shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {d.scheduledFor ? dayLabel(d.scheduledFor) : "unscheduled"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {d.title}
              </span>
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {d.pillar}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  d.decision === "approved"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {d.decision ?? "undecided"}
              </span>
            </li>
          ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Approved posts sit in the queue on{" "}
        <span className="font-semibold text-foreground">/company</span> — copy
        each one on its day, then log what it did in Performance below.
      </p>
    </section>
  );
}
