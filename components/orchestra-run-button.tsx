"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Play, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { todayDate } from "@/lib/orchestra/types";
import OrchestraRunProgress from "@/components/orchestra-run-progress";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["queued", "in_progress", "delivered"]);
// Mirrors STALE_MINUTES in app/api/orchestra/run/route.ts — a task that hasn't
// moved in this long belongs to a run that is no longer alive.
const STALE_MS = 10 * 60_000;

type Result = { ok: boolean; message: string };

export default function OrchestraRunButton({
  alreadyRan,
}: {
  alreadyRan: boolean;
}) {
  const [waiting, setWaiting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const startedAt = useRef<number | null>(null);
  const router = useRouter();
  const runDate = todayDate();

  const report = useQuery(
    api.orchestra.latestReport,
    waiting ? { runDate } : "skip",
  );
  const tasks = useQuery(
    api.orchestra.tasksForRun,
    waiting ? { runDate } : "skip",
  );

  // When a background run finishes (or dies), settle the button from live
  // Convex state instead of holding one HTTP request open for minutes.
  useEffect(() => {
    if (!waiting || startedAt.current == null) return;

    if (report) {
      const stats = report.stats as {
        verified?: number;
        escalated?: number;
        costUsd?: number;
      };
      setResult({
        ok: true,
        message: `Run complete - verified ${stats.verified ?? 0}, escalated ${stats.escalated ?? 0}, $${Number(stats.costUsd ?? 0).toFixed(2)} spent.`,
      });
      setWaiting(false);
      startedAt.current = null;
      router.refresh();
      return;
    }

    const list = tasks ?? [];
    // "Active" is not the same as "alive": a run that dies leaves its last task
    // parked in delivered/in_progress, and waiting on that is what made this
    // button spin for the full 12 minutes with nothing coming.
    const active = list.some(
      (t) =>
        ACTIVE.has(t.status) &&
        Date.now() - Date.parse(t.updatedAt) < STALE_MS,
    );
    const elapsed = Date.now() - startedAt.current;

    // Give the after() callback a moment to create the first task before we
    // treat an empty board as failure.
    if (!active && list.length > 0 && elapsed > 15_000) {
      // Newest first: the last thing that went wrong is the useful one, not
      // whichever failure happens to sort first.
      const failed = list
        .filter((t) => ["failed", "blocked"].includes(t.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const stalled = list.filter(
        (t) => ACTIVE.has(t.status) && Date.now() - Date.parse(t.updatedAt) >= STALE_MS,
      );
      setResult({
        ok: false,
        message:
          failed[0]?.statusReason?.slice(0, 200) ||
          (stalled.length > 0
            ? `Run stalled - ${stalled[0].role} stopped responding. Click again to start a fresh one.`
            : "Run stopped without a report - check the board for task errors."),
      });
      setWaiting(false);
      startedAt.current = null;
      router.refresh();
      return;
    }

    if (elapsed > 12 * 60_000) {
      setResult({
        ok: false,
        message:
          "Still running after 12 minutes - refresh the page; if today's report is there, it finished.",
      });
      setWaiting(false);
      startedAt.current = null;
    }
  }, [waiting, report, tasks, router]);

  async function run() {
    setResult(null);
    setWaiting(true);
    startedAt.current = Date.now();
    try {
      const res = await fetch("/api/orchestra/run", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        started?: boolean;
        alreadyRan?: boolean;
        alreadyRunning?: boolean;
      };
      if (!res.ok || !data.ok) {
        setResult({
          ok: false,
          message: data.error ?? `Could not start run (${res.status}).`,
        });
        setWaiting(false);
        startedAt.current = null;
        return;
      }
      if (data.alreadyRan) {
        setResult({
          ok: true,
          message: "Already ran today - showing the existing report.",
        });
        setWaiting(false);
        startedAt.current = null;
        router.refresh();
        return;
      }
      setResult({
        ok: true,
        message: data.alreadyRunning
          ? "A run is already in progress - waiting for today's report…"
          : "Run started - agents are working (a few minutes)…",
      });
    } catch (err) {
      setResult({
        ok: false,
        message:
          err instanceof Error && /failed to fetch/i.test(err.message)
            ? "Could not reach the server to start the run. Check that npm run dev is up, then try again."
            : `Could not start run: ${err instanceof Error ? err.message : String(err)}`,
      });
      setWaiting(false);
      startedAt.current = null;
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => void run()}
        disabled={waiting}
        className={cn(
          "group flex h-12 items-center gap-2.5 rounded-full pl-5 pr-2 text-sm font-bold transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]",
          waiting
            ? "cursor-wait bg-secondary pr-5 text-muted-foreground"
            : "bg-brand-500 text-brand-950 shadow-[0_14px_36px_-16px_rgba(245,158,11,0.85)] hover:bg-brand-400",
        )}
      >
        {waiting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Running… (a few minutes)
          </>
        ) : (
          <>
            <span>{alreadyRan ? "Re-check today" : "Run today"}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-950/10 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:scale-105">
              <Play size={14} strokeWidth={2.75} className="ml-0.5" />
            </span>
          </>
        )}
      </button>
      {result && (
        <p
          className={cn(
            "max-w-xs text-right text-[11px] font-medium",
            result.ok ? "text-muted-foreground" : "text-rose-500",
          )}
        >
          {result.message}
        </p>
      )}
      {/* Driven by live Convex task rows, not by `waiting` — so a page reload
          mid-run still shows where the agents are. */}
      <OrchestraRunProgress runDate={runDate} />
    </div>
  );
}
