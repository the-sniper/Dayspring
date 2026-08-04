"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PLATFORM_IDS, platformSpec } from "@/shared/platforms";
import { cn } from "@/lib/utils";

// Every dated thing, on one grid: planned slots that have no words yet, drafts
// waiting on a decision, approved posts waiting for their day, and what
// already shipped. Live from Convex, so approving a draft moves it here
// without a reload.

const PLATFORM_DOT: Record<string, string> = {
  linkedin: "bg-blue-500",
  x: "bg-stone-400",
  reddit: "bg-orange-500",
};

const STATE_STYLE: Record<string, string> = {
  planned: "border-dashed border-border/70 bg-card/50 text-muted-foreground",
  draft: "border-amber-500/40 bg-amber-500/[0.07] text-foreground",
  approved: "border-emerald-500/40 bg-emerald-500/[0.07] text-foreground",
  posted: "border-border bg-secondary/40 text-muted-foreground",
  rejected: "border-rose-500/30 bg-rose-500/[0.05] text-muted-foreground line-through",
};

const STATE_LABEL: Record<string, string> = {
  planned: "planned",
  draft: "needs your call",
  approved: "ready to post",
  posted: "posted",
  rejected: "rejected",
};

function monthMeta(anchor: string) {
  const [y, m] = anchor.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  // Grid starts on the Monday on/before the 1st.
  const lead = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - lead);
  const cells: string[] = [];
  const cursor = new Date(gridStart);
  while (cells.length < 42) {
    cells.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cells.length >= 35 && cursor > last && (cells.length % 7 === 0)) break;
  }
  return {
    label: first.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    monthIndex: m - 1,
    year: y,
    from: cells[0],
    to: cells[cells.length - 1],
    cells,
  };
}

function shiftMonth(anchor: string, delta: number): string {
  const [y, m] = anchor.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7) + "-01";
}

export default function ContentCalendarView({ today }: { today: string }) {
  const [anchor, setAnchor] = useState(`${today.slice(0, 7)}-01`);
  const [platformFilter, setPlatformFilter] = useState<string[]>([...PLATFORM_IDS]);
  const meta = useMemo(() => monthMeta(anchor), [anchor]);

  const items = useQuery(api.orchestra.calendarItems, {
    from: meta.from,
    to: meta.to,
  });

  const byDate = useMemo(() => {
    const map = new Map<string, NonNullable<typeof items>>();
    for (const it of items ?? []) {
      if (!platformFilter.includes(it.platform)) continue;
      const list = map.get(it.date) ?? [];
      list.push(it);
      map.set(it.date, list);
    }
    return map;
  }, [items, platformFilter]);

  const upcoming = (items ?? [])
    .filter((i) => i.date >= today && platformFilter.includes(i.platform))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor(shiftMonth(anchor, -1))}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Previous month"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-[10rem] text-center font-display text-lg font-bold text-foreground">
            {meta.label}
          </span>
          <button
            type="button"
            onClick={() => setAnchor(shiftMonth(anchor, 1))}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Next month"
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(`${today.slice(0, 7)}-01`)}
            className="ml-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted"
          >
            Today
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PLATFORM_IDS.map((p) => {
            const on = platformFilter.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setPlatformFilter((prev) =>
                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                  )
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors",
                  on
                    ? "border-border bg-card text-foreground"
                    : "border-border/50 bg-transparent text-muted-foreground/50",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", PLATFORM_DOT[p], !on && "opacity-40")} />
                {platformSpec(p).label}
              </button>
            );
          })}
        </div>
      </div>

      {items === undefined ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
          <Loader2 size={15} className="animate-spin" /> Loading the calendar…
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[46rem]">
              <div className="grid grid-cols-7 gap-1.5 pb-1.5">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {meta.cells.map((date) => {
                  const inMonth = Number(date.slice(5, 7)) - 1 === meta.monthIndex;
                  const dayItems = byDate.get(date) ?? [];
                  const isToday = date === today;
                  return (
                    <div
                      key={date}
                      className={cn(
                        "min-h-[6.5rem] rounded-xl border p-1.5 transition-colors",
                        inMonth ? "border-border/60 bg-card" : "border-transparent bg-transparent",
                        isToday && "ring-2 ring-brand-500/40",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between px-0.5">
                        <span
                          className={cn(
                            "text-[11px] font-bold",
                            isToday
                              ? "text-brand-600 dark:text-brand-400"
                              : inMonth
                                ? "text-muted-foreground"
                                : "text-muted-foreground/30",
                          )}
                        >
                          {Number(date.slice(8, 10))}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {dayItems.map((it) => {
                          const body = (
                            <div
                              className={cn(
                                "rounded-lg border px-1.5 py-1 text-[10px] leading-tight transition-all",
                                STATE_STYLE[it.state],
                                it.postId || it.campaignId ? "hover:brightness-110" : "",
                              )}
                              title={`${platformSpec(it.platform).label}${it.channel ? ` · ${it.channel}` : ""} — ${it.title} (${STATE_LABEL[it.state]})`}
                            >
                              <div className="flex items-center gap-1">
                                <span
                                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PLATFORM_DOT[it.platform])}
                                />
                                <span className="min-w-0 flex-1 truncate font-semibold">
                                  {it.title}
                                </span>
                                {it.hasImage && (
                                  <ImageIcon
                                    size={9}
                                    className={cn(
                                      "shrink-0",
                                      it.imageReady ? "text-emerald-500" : "text-muted-foreground/60",
                                    )}
                                  />
                                )}
                              </div>
                              {it.metrics?.impressions ? (
                                <span className="mt-0.5 block truncate font-mono text-[9px] opacity-70">
                                  {it.metrics.impressions} impr
                                </span>
                              ) : null}
                            </div>
                          );
                          return it.campaignId ? (
                            <Link
                              key={it.key}
                              href={`/company/studio?c=${it.campaignId}`}
                              className="block"
                            >
                              {body}
                            </Link>
                          ) : (
                            <div key={it.key}>{body}</div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <CalendarDays size={13} /> Next up
            </h2>
            {upcoming.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nothing scheduled ahead. Start a campaign and the team will fill
                this in.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {upcoming.map((it) => (
                  <li
                    key={it.key}
                    className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5"
                  >
                    <span className="w-24 shrink-0 text-[11px] font-bold text-muted-foreground">
                      {new Date(`${it.date}T00:00:00Z`).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    </span>
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", PLATFORM_DOT[it.platform])} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {it.title}
                    </span>
                    {it.channel && (
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {it.channel}
                      </span>
                    )}
                    {it.hasImage && (
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                          it.imageReady
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        <ImageIcon size={10} /> {it.imageReady ? "image ready" : "image needed"}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        STATE_STYLE[it.state],
                      )}
                    >
                      {STATE_LABEL[it.state]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
