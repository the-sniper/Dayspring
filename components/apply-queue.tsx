"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Check,
  CircleAlert,
  Eye,
  Loader2,
  MonitorCheck,
  Play,
  Rocket,
  RotateCcw,
  ShieldAlert,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  acceptTosForQueuedAction,
  applyStateAction,
  approveSubmitAction,
  cancelApplyAction,
  manualSubmittedAction,
  skipFillAction,
  startQueuedApplyAction,
  verdictAction,
} from "@/lib/actions/apply";
import type { ApplySessionState } from "@/lib/apply/session";
import ApplyLiveView from "@/components/apply-live-view";
import CompanyLogo from "@/components/company-logo";
import ScoreBadge from "@/components/score-badge";
import RoleChip from "@/components/role-chip";
import type { RoleType } from "@/lib/types";
import { cn } from "@/lib/utils";

type QueueRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.applyQueue.list>>
>[number];

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-secondary text-muted-foreground",
  applying: "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300",
  submitted: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  manual: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  skipped: "bg-secondary text-muted-foreground",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400",
};

// The auto-apply bucket runner. Entries advance one at a time through the
// same attended session machinery as the job-page Apply panel: browser opens
// on this machine, autofills, and PAUSES for the user's review — approving
// each submission stays a human click. "Run queue" just chains the sessions.
export default function ApplyQueue() {
  const rows = useQuery(api.applyQueue.list, {});
  const masters = useQuery(api.resumes.listMasters, {});
  const setResume = useMutation(api.applyQueue.setResume);
  const setStatus = useMutation(api.applyQueue.setStatus);
  const removeEntry = useMutation(api.applyQueue.remove);

  const [running, setRunning] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [session, setSession] = useState<ApplySessionState | null>(null);
  const [tos, setTos] = useState<{ host: string; row: QueueRow } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The run loop reads the freshest rows without re-subscribing.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const runningRef = useRef(running);
  runningRef.current = running;

  const queued = (rows ?? []).filter((r) => r.status === "queued");
  const finished = (rows ?? []).filter(
    (r) => !["queued", "applying"].includes(r.status),
  );

  async function finishEntry(row: QueueRow, s: ApplySessionState) {
    const status =
      s.outcome === "submitted"
        ? "submitted"
        : s.outcome === "manual"
          ? "manual"
          : s.outcome === "error"
            ? "failed"
            : "skipped";
    await setStatus({ id: row.id, status, note: s.message.slice(0, 300) });
  }

  // The ONLY place an entry gets finished and the queue advanced — decision
  // handlers just refresh the display. A second finisher creates a race where
  // both advance and the run dies with an orphaned session.
  async function pollUntilDone(row: QueueRow) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      const s = await applyStateAction(row.jobId);
      if (!s) {
        await setStatus({ id: row.id, status: "failed", note: "session lost" });
        break;
      }
      setSession(s);
      if (s.phase === "done") {
        await finishEntry(row, s);
        break;
      }
    }
    setSession(null);
    setCurrentId(null);
    if (runningRef.current) void advance();
    else setRunning(false);
  }

  async function runEntry(row: QueueRow) {
    setCurrentId(row.id);
    setError(null);
    await setStatus({ id: row.id, status: "applying" });
    const res = await startQueuedApplyAction(
      row.jobId,
      row.masterResumeId ? String(row.masterResumeId) : null,
    );
    if (!res.ok) {
      if (res.needsTosFor) {
        // Wait for the human — accept resumes the run, decline skips.
        setTos({ host: res.needsTosFor, row });
        return;
      }
      await setStatus({ id: row.id, status: "failed", note: res.error.slice(0, 300) });
      setCurrentId(null);
      if (runningRef.current) void advance();
      return;
    }
    setSession(res.state);
    void pollUntilDone(row);
  }

  async function advance() {
    const next = (rowsRef.current ?? []).find((r) => r.status === "queued");
    if (!next || !runningRef.current) {
      setRunning(false);
      setCurrentId(null);
      return;
    }
    await runEntry(next);
  }

  function startRun() {
    if (running || queued.length === 0) return;
    setRunning(true);
    runningRef.current = true;
    void advance();
  }

  function acceptTos() {
    if (!tos) return;
    const { host, row } = tos;
    startTransition(async () => {
      setTos(null);
      const res = await acceptTosForQueuedAction(
        host,
        row.jobId,
        row.masterResumeId ? String(row.masterResumeId) : null,
      );
      if (!res.ok) {
        await setStatus({ id: row.id, status: "failed", note: res.error.slice(0, 300) });
        setCurrentId(null);
        if (runningRef.current) void advance();
        return;
      }
      setSession(res.state);
      void pollUntilDone(row);
    });
  }

  function declineTos() {
    if (!tos) return;
    const { row } = tos;
    startTransition(async () => {
      setTos(null);
      await setStatus({ id: row.id, status: "skipped", note: "automation not accepted for this site" });
      setCurrentId(null);
      if (runningRef.current) void advance();
    });
  }

  function decide(_row: QueueRow, fn: () => Promise<{ ok: boolean; state?: ApplySessionState; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      // Display only — pollUntilDone owns finishing + advancing.
      if (res.ok && res.state) setSession(res.state);
      else if (!res.ok && res.error) setError(res.error);
    });
  }

  // Entries stuck "applying" from a lost runner (page reload, crash): if the
  // session is still live, re-attach to it; if it's gone, re-queue the entry.
  useEffect(() => {
    if (!rows || currentId) return;
    const stuck = rows.filter((r) => r.status === "applying");
    if (stuck.length === 0) return;
    void (async () => {
      for (const r of stuck) {
        const s = await applyStateAction(r.jobId);
        if (s && s.phase !== "done") {
          setCurrentId(r.id);
          setSession(s);
          void pollUntilDone(r);
          return; // one live session at a time by construction
        }
        await setStatus({ id: r.id, status: "queued" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows === undefined, currentId]);

  const btn =
    "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer";
  const currentRow = (rows ?? []).find((r) => r.id === currentId) ?? null;

  const mastersWithPdf = (masters ?? []).filter((m) => m.sourceFileId || m.sourceFile);

  return (
    <div>
      {/* Run controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {!running ? (
          <button
            type="button"
            disabled={queued.length === 0}
            onClick={startRun}
            className={cn(btn, "bg-brand-500 text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600")}
          >
            <Play size={16} />
            {queued.length === 0
              ? "Queue is empty"
              : `Start applying (${queued.length})`}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setRunning(false)}
            className={cn(btn, "border border-border bg-card text-foreground")}
          >
            <Square size={14} />
            Stop after current
          </button>
        )}
        <p className="text-xs font-medium text-muted-foreground">
          A browser opens on this machine per job; you review and approve every
          submission — nothing sends on its own.
        </p>
      </div>

      {error && (
        <p className="mb-4 flex items-start gap-2 text-xs font-medium text-destructive">
          <CircleAlert size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {/* ToS gate mid-run */}
      {tos && (
        <div className="mb-6 rounded-xl border border-amber-300/50 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="flex items-start gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            First run against {tos.host} — automated form-filling can violate a
            site&apos;s ToS. Accept once per site, or skip this job.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} onClick={acceptTos} className={cn(btn, "bg-amber-600 text-white hover:bg-amber-700")}>
              <Check size={16} /> Accept for {tos.host}
            </button>
            <button type="button" disabled={pending} onClick={declineTos} className={cn(btn, "border border-border bg-card text-foreground")}>
              Skip this job
            </button>
          </div>
        </div>
      )}

      {/* Live session card */}
      {session && currentRow && (
        <div className="mb-6 rounded-2xl border border-brand-500/30 bg-brand-50/30 p-5 dark:bg-brand-950/10">
          <div className="flex items-center gap-2">
            {session.phase === "awaiting_review" || session.phase === "awaiting_verdict" ? (
              <MonitorCheck size={16} className="text-brand-500" />
            ) : (
              <Loader2 size={16} className="animate-spin text-brand-500" />
            )}
            <p className="text-xs font-black uppercase tracking-widest text-brand-600 dark:text-brand-400">
              {
                {
                  launching: "Opening browser",
                  filling: "Autofilling",
                  awaiting_review: "Your review",
                  submitting: "Submitting",
                  awaiting_verdict: "Did it go through?",
                  done: "Done",
                }[session.phase]
              }
            </p>
            <span className="ml-auto text-xs font-bold text-foreground">
              {session.jobTitle} · {session.companyName}
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-foreground leading-relaxed">{session.message}</p>
          {session.filled.length > 0 && (
            <p className="mt-2 text-[11px] font-medium text-muted-foreground">
              ✓ filled: {session.filled.join(", ")}
              {session.skipped.length > 0 && (
                <span className="block">– fill manually if present: {session.skipped.join(", ")}</span>
              )}
            </p>
          )}
          {session.resumeSource && (
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              Resume attached: {{ tailored: "tailored for this job", master: "master resume", settings: "fallback path" }[session.resumeSource]}
            </p>
          )}
          {session.phase === "awaiting_review" && (session.review?.length ?? 0) > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
              <p className="border-b border-border bg-secondary/30 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                What will be submitted
              </p>
              <div className="max-h-44 overflow-y-auto">
                {session.review!.map((r, i) => (
                  <div key={i} className="flex gap-3 border-b border-border/50 px-3 py-1.5 text-[11px] last:border-0">
                    <span className="w-2/5 shrink-0 truncate font-semibold text-muted-foreground" title={r.label}>{r.label}</span>
                    <span className="min-w-0 truncate font-medium text-foreground" title={r.value}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <ApplyLiveView active={session.mode === "embedded" && session.phase !== "done"} />
          {session.phase === "filling" && (
            <button
              type="button"
              onClick={() => void skipFillAction()}
              className={cn(btn, "mt-4 border border-border bg-card text-muted-foreground text-xs px-3 py-2")}
            >
              Taking too long? Skip to review
            </button>
          )}
          {session.phase === "awaiting_review" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => decide(currentRow, () => approveSubmitAction(currentRow.jobId))} className={cn(btn, "bg-brand-500 text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600")}>
                {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                Approve &amp; Submit
              </button>
              <button type="button" disabled={pending} onClick={() => decide(currentRow, () => manualSubmittedAction(currentRow.jobId))} className={cn(btn, "border border-border bg-card text-foreground")}>
                I clicked Submit myself
              </button>
              <button type="button" disabled={pending} onClick={() => decide(currentRow, () => cancelApplyAction(currentRow.jobId))} className={cn(btn, "border border-border bg-card text-muted-foreground")}>
                <X size={14} /> Skip
              </button>
            </div>
          )}
          {session.phase === "awaiting_verdict" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => decide(currentRow, () => verdictAction(currentRow.jobId, true))} className={cn(btn, "bg-emerald-600 text-white hover:bg-emerald-700")}>
                <Check size={16} strokeWidth={3} /> Yes — it submitted
              </button>
              <button type="button" disabled={pending} onClick={() => decide(currentRow, () => verdictAction(currentRow.jobId, false))} className={cn(btn, "border border-border bg-card text-foreground")}>
                No — record as not submitted
              </button>
            </div>
          )}
        </div>
      )}

      {/* Queue table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-6 py-4">Role &amp; Company</th>
              <th className="px-4 py-4 text-center">Score</th>
              <th className="px-4 py-4">Resume</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(rows ?? []).map((r) => (
              <tr key={String(r.id)} className={cn("group transition-colors", r.id === currentId && "bg-brand-50/40 dark:bg-brand-950/20")}>
                <td className="px-6 py-4 max-w-[340px]">
                  <div className="flex items-center gap-3">
                    <CompanyLogo name={r.companyName} className="h-9 w-9 text-xs" />
                    <div className="min-w-0">
                      <Link href={`/jobs/${r.jobId}`} className="block truncate font-bold text-foreground hover:text-brand-600 transition-colors" title={r.title}>
                        {r.title}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-2 font-medium text-muted-foreground truncate">
                        {r.companyName}
                        <RoleChip role={(r.roleType ?? null) as RoleType | null} />
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <ScoreBadge score={r.matchScore} />
                </td>
                <td className="px-4 py-4">
                  <div className="flex max-w-[260px] flex-col gap-1.5">
                    {r.status === "queued" ? (
                      <select
                        value={r.masterResumeId ? String(r.masterResumeId) : "auto"}
                        onChange={(e) =>
                          void setResume({
                            id: r.id,
                            masterResumeId:
                              e.target.value === "auto"
                                ? null
                                : (e.target.value as Id<"masterResumes">),
                          })
                        }
                        className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-semibold text-foreground outline-none focus:border-brand-500/50"
                      >
                        <option value="auto">
                          Auto{r.hasTailored ? " (tailored for this job)" : " (primary master)"}
                        </option>
                        {mastersWithPdf.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                            {m.isPrimary ? " ⭐" : ""}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {r.resumeLabel ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="min-w-0 truncate text-xs font-medium text-foreground"
                          title={r.resumeLabel}
                        >
                          {r.resumeLabel}
                        </span>
                        {r.resumeViewHref ? (
                          <a
                            href={r.resumeViewHref}
                            target="_blank"
                            rel="noreferrer"
                            title="View resume PDF"
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:border-brand-500 hover:text-brand-600 active:scale-95"
                          >
                            <Eye size={14} />
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        No PDF resume
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", STATUS_STYLE[r.status] ?? STATUS_STYLE.queued)}>
                    {r.status}
                  </span>
                  {r.note && !["queued", "applying"].includes(r.status) && (
                    <p className="mt-1 max-w-[260px] truncate text-[10px] font-medium text-muted-foreground" title={r.note}>
                      {r.note}
                    </p>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {r.id !== currentId && (
                    <div className="flex items-center justify-end gap-2">
                      {/* A failed/skipped entry is a dead end otherwise: the run
                          loop only picks up "queued", so retrying used to mean
                          deleting the row and re-queueing from the job page. */}
                      {["failed", "skipped"].includes(r.status) && (
                        <button
                          type="button"
                          title="Put this job back in the queue"
                          onClick={() => void setStatus({ id: r.id, status: "queued" })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:border-brand-500 hover:text-brand-600 active:scale-95"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        title={r.status === "queued" ? "Remove from queue" : "Clear entry"}
                        onClick={() => void removeEntry({ id: r.id })}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:border-destructive hover:text-destructive active:scale-95"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(rows ?? []).length === 0 && rows !== undefined && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Zap size={24} />
            </div>
            <h3 className="text-lg font-bold text-foreground">Nothing queued</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Queue jobs from your{" "}
              <Link href="/" className="font-bold text-brand-600 dark:text-brand-400">top matches</Link>{" "}
              or the <Link href="/feed" className="font-bold text-brand-600 dark:text-brand-400">feed</Link>, pick a
              resume per job, then run the queue.
            </p>
          </div>
        )}
        {rows === undefined && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm font-medium text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading queue…
          </div>
        )}
      </div>

      {finished.length > 0 && (
        <p className="mt-4 text-xs font-medium text-muted-foreground">
          <Rocket size={12} className="mr-1 inline" />
          {finished.filter((r) => r.status === "submitted" || r.status === "manual").length} of {finished.length} finished entries submitted.
        </p>
      )}
    </div>
  );
}
