"use client";

import Tip from "@/components/tip";
import { cn } from "@/lib/utils";

const bands = [
  { min: 85, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" }, // apply now
  { min: 70, cls: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border-brand-200 dark:border-brand-800" }, // strong
  { min: 50, cls: "bg-stone-100 text-stone-700 dark:bg-stone-800/50 dark:text-stone-300 border-stone-200 dark:border-stone-700" }, // stretch
  { min: 0, cls: "bg-stone-50 text-stone-500 dark:bg-stone-900/50 dark:text-stone-500 border-stone-100 dark:border-stone-800" }, // skip
];

export default function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-flex h-6 w-10 items-center justify-center rounded-full bg-secondary/50 text-[10px] font-bold text-muted-foreground/40">
        —
      </span>
    );
  }
  const band = bands.find((b) => score >= b.min) ?? bands[bands.length - 1];
  return (
    <Tip label="Match score">
      <span
        className={cn(
          "inline-flex h-6 w-10 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums shadow-sm",
          band.cls,
        )}
      >
        {score}
      </span>
    </Tip>
  );
}
