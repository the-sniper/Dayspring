"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Check, Loader2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { displayName } from "@/lib/orchestra/registry";
import { cn } from "@/lib/utils";

// Live progress for a run in flight.
//
// Everything here is already in Convex and already reactive — orchTasks rows
// appear as each stage starts and flip status as it finishes — so this needs no
// polling and no new plumbing. The point is the "not stuck" signal: a spinner
// alone is indistinguishable from a dead run (which is exactly how a stranded
// task went unnoticed for 16 minutes), so this shows WHICH stage is working,
// how long since anything last moved, and what has been spent.

// The pipeline in run.ts order. Later lanes only create tasks when the run
// reaches them, so a stage with no row yet is simply "pending".
const STAGES: { role: string; label: string }[] = [
  { role: "atlas", label: "Plans the day" },
  { role: "radar", label: "Researches" },
  { role: "sentinel", label: "Verifies" },
  { role: "compass", label: "Picks angles" },
  { role: "quill", label: "Drafts posts" },
  { role: "herald", label: "Outreach research" },
];

// Per-stage icons have to mean something. Lumping queued/in_progress/delivered
// together as "spinning" is how a finished stage and an unstarted one both look
// busy — the exact ambiguity that let a stranded "delivered" task pass for work
// in progress. Only in_progress spins.
const DONE = new Set(["verified", "escalated"]);
const HANDED_OFF = new Set(["delivered"]); // produced its artifact, awaiting the verifier
const WAITING = new Set(["queued"]);
const DEAD = new Set(["failed", "blocked"]);
const ACTIVE = new Set(["queued", "in_progress", "delivered"]); // run is alive
const STALE_MS = 10 * 60_000;

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s ago`;
}

export default function OrchestraRunProgress({ runDate }: { runDate: string }) {
  const tasks = useQuery(api.orchestra.tasksForRun, { runDate });
  const spend = useQuery(api.orchestra.spendForDate, { runDate });
  const report = useQuery(api.orchestra.latestReport, { runDate });

  // Re-render on a tick so "last activity" stays honest between Convex pushes —
  // a frozen timestamp is the thing that makes a live run look dead.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!tasks || tasks.length === 0 || report) return null;

  const byRole = new Map<string, (typeof tasks)[number]>();
  for (const t of tasks) {
    const prev = byRole.get(t.role);
    if (!prev || t.updatedAt > prev.updatedAt) byRole.set(t.role, t);
  }

  const lastMovedAt = Math.max(...tasks.map((t) => Date.parse(t.updatedAt)));
  const sinceLastMove = Date.now() - lastMovedAt;
  const stalled = sinceLastMove > STALE_MS;
  const anyRunning = tasks.some((t) => ACTIVE.has(t.status));
  if (!anyRunning && !stalled) return null;

  const reached = STAGES.filter((s) => byRole.has(s.role)).length;
  const finished = STAGES.filter((s) => {
    const t = byRole.get(s.role);
    return t && (DONE.has(t.status) || HANDED_OFF.has(t.status));
  }).length;
  // Credit the in-flight stage as half done so the bar always moves when a
  // stage starts, not only when one completes.
  const pct = Math.min(
    99,
    Math.round(((finished + (anyRunning ? 0.5 : 0)) / Math.max(reached, 1)) * 100),
  );

  return (
    <div className="mt-3 w-full rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {stalled ? "No response" : "Agents working"}
        </p>
        <p className={cn("text-[11px] font-medium", stalled ? "text-rose-500" : "text-muted-foreground")}>
          last activity {ago(sinceLastMove)}
          {spend ? ` · $${spend.costUsd.toFixed(2)} · ${spend.calls} calls` : ""}
        </p>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            stalled ? "bg-rose-500" : "bg-[var(--accent)]",
          )}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {STAGES.map((stage) => {
          const task = byRole.get(stage.role);
          const state = !task
            ? "pending"
            : DONE.has(task.status)
              ? "done"
              : DEAD.has(task.status)
                ? "dead"
                : HANDED_OFF.has(task.status)
                  ? "handed off"
                  : WAITING.has(task.status)
                    ? "queued"
                    : "running";
          return (
            <li key={stage.role} className="flex items-center gap-2.5 text-xs">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {state === "done" && <Check size={13} className="text-emerald-500" strokeWidth={3} />}
                {state === "handed off" && <Check size={13} className="text-muted-foreground" strokeWidth={3} />}
                {state === "dead" && <X size={13} className="text-rose-500" strokeWidth={3} />}
                {state === "running" && <Loader2 size={13} className="animate-spin text-[var(--accent)]" />}
                {state === "queued" && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />}
                {state === "pending" && <span className="h-1.5 w-1.5 rounded-full bg-border" />}
              </span>
              <span
                className={cn(
                  "font-semibold",
                  state === "pending" || state === "queued"
                    ? "text-muted-foreground/60"
                    : "text-foreground",
                )}
              >
                {displayName(stage.role)}
              </span>
              <span className="truncate text-muted-foreground">
                {state === "running" ? `${stage.label}…` : stage.label}
              </span>
              {state === "queued" && (
                <span className="shrink-0 text-[10px] text-muted-foreground/60">waiting</span>
              )}
              {task?.attempts && task.attempts > 1 ? (
                <span className="ml-auto shrink-0 text-[10px] font-medium text-muted-foreground">
                  attempt {task.attempts}
                </span>
              ) : null}
              {state === "dead" && task?.statusReason ? (
                <span className="ml-auto max-w-[45%] truncate text-[10px] text-rose-500" title={task.statusReason}>
                  {task.statusReason}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {stalled && (
        <p className="mt-3 text-[11px] font-medium text-rose-500">
          Nothing has moved in over 10 minutes — this run is dead. Click “Run
          today” to retire it and start a fresh one.
        </p>
      )}
    </div>
  );
}
