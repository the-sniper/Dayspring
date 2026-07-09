"use client";

import { useState, useTransition } from "react";
import { AlarmClock, Loader2, AlertCircle } from "lucide-react";
import {
  installDailyAction,
  uninstallDailyAction,
  type DailyRunStatus,
} from "@/lib/actions/automation";
import { cn } from "@/lib/utils";

// Settings toggle for the 7:30am daily run (launchd agent on this machine).
export default function AutomationPanel({ initial }: { initial: DailyRunStatus }) {
  const [installed, setInstalled] = useState(initial.installed);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = installed ? await uninstallDailyAction() : await installDailyAction();
      if (res.ok) setInstalled(!installed);
      else setError(res.error);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <AlarmClock size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
          Daily Run
        </h2>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter",
            installed
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {installed ? "On · 7:30am" : "Off"}
        </span>
      </div>

      <p className="mb-3 text-[11px] font-medium text-muted-foreground leading-relaxed">
        Every morning: pull new jobs, score them, check for replies, queue
        follow-ups, and email you the digest. Missed runs (laptop asleep) fire
        on the next wake.
      </p>

      {initial.lastRun && (
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Last ran {initial.lastRun.slice(0, 16).replace("T", " ")}
        </p>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        className={cn(
          "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer",
          installed
            ? "border border-border bg-card text-muted-foreground hover:text-destructive"
            : "bg-primary text-primary-foreground shadow-lg shadow-primary/10",
        )}
      >
        {pending && <Loader2 size={14} className="animate-spin" />}
        {installed ? "Turn off" : "Turn on"}
      </button>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-destructive">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}
