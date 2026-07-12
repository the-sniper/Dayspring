"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Rocket,
  Loader2,
  CircleCheck,
  CircleAlert,
  ShieldAlert,
  MonitorCheck,
  X,
  KeyRound,
  MailCheck,
  Check,
} from "lucide-react";
import {
  acceptTosAction,
  applyStateAction,
  approveSubmitAction,
  cancelApplyAction,
  manualSubmittedAction,
  readOtpAction,
  startApplyAction,
  vaultWorkdayAccountAction,
  verdictAction,
} from "@/lib/actions/apply";
import type { ApplySessionState } from "@/lib/apply/session";
import { cn } from "@/lib/utils";

// Button-driven apply. A browser window opens ON THE MACHINE RUNNING
// DAYSPRING, autofills, and waits; every decision happens right here. The
// human still owns CAPTCHAs, EEO answers, and the approval itself.
export default function ApplyPanel({
  jobId,
  hasProfile,
  hasResume,
  hasTailored,
  applyStatus,
}: {
  jobId: string;
  hasProfile: boolean;
  hasResume: boolean;
  hasTailored: boolean;
  applyStatus: string | null;
}) {
  const [state, setState] = useState<ApplySessionState | null>(null);
  const [tosHost, setTosHost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [vaulted, setVaulted] = useState(false);
  const [pending, startTransition] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activePhases = ["launching", "filling", "awaiting_review", "submitting", "awaiting_verdict"];
  const isActive = !!state && activePhases.includes(state.phase);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll session state while a session is live (the flow advances server-side).
  useEffect(() => {
    if (!isActive) {
      stopPoll();
      return;
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(async () => {
        const s = await applyStateAction(jobId);
        if (s) setState(s);
        if (!s || s.phase === "done") stopPoll();
      }, 1500);
    }
    return stopPoll;
  }, [isActive, jobId, stopPoll]);

  function start() {
    setError(null);
    setTosHost(null);
    setOtp(null);
    setVaulted(false);
    startTransition(async () => {
      const res = await startApplyAction(jobId);
      if (res.ok) setState(res.state);
      else if (res.needsTosFor) setTosHost(res.needsTosFor);
      else setError(res.error);
    });
  }

  function acceptTos() {
    if (!tosHost) return;
    startTransition(async () => {
      const res = await acceptTosAction(tosHost, jobId);
      setTosHost(null);
      if (res.ok) setState(res.state);
      else setError(res.error);
    });
  }

  function decide(fn: () => Promise<{ ok: boolean; state?: ApplySessionState; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok && res.state) setState(res.state);
      else if (!res.ok && res.error) setError(res.error);
    });
  }

  const Prereq = ({ ok, label }: { ok: boolean; label: string }) => (
    <li className="flex items-center gap-2 text-xs font-medium">
      {ok ? (
        <CircleCheck size={14} className="text-emerald-500" />
      ) : (
        <CircleAlert size={14} className="text-amber-500" />
      )}
      <span className={ok ? "text-muted-foreground" : "text-foreground"}>{label}</span>
    </li>
  );

  const btn =
    "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer";

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Rocket size={16} className="text-brand-500" />
        <h3 className="text-sm font-bold text-foreground">Apply</h3>
        {applyStatus && !isActive && (
          <span className="rounded-md bg-secondary px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
            {applyStatus}
          </span>
        )}
      </div>

      {/* Idle → start */}
      {!isActive && !tosHost && (
        <>
          <p className="mb-3 text-[11px] font-medium text-muted-foreground leading-relaxed">
            Opens a browser window on this machine and fills the application —
            your details, this job&apos;s resume, tailored answers. You review
            everything (CAPTCHA and EEO stay yours), then approve here and{" "}
            <span className="font-bold">it submits for you</span>.
          </p>
          <ul className="mb-3 space-y-1">
            <Prereq ok={hasProfile} label="Profile set (fills name/email/links)" />
            <Prereq ok={hasResume} label="Resume ready (tailored → master → fallback)" />
            <Prereq ok={hasTailored} label="Tailored bullets + cover letter (optional)" />
          </ul>
          <button
            type="button"
            disabled={pending || !hasProfile}
            onClick={start}
            className={cn(btn, "bg-brand-500 text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600")}
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
            {state?.phase === "done" ? "Apply again" : "Apply with assist"}
          </button>
          {!hasProfile && (
            <p className="mt-2 text-[10px] font-bold text-amber-600">
              Upload a master resume (or set your profile) in Settings first.
            </p>
          )}
          {state?.phase === "done" && (
            <p
              className={cn(
                "mt-3 flex items-start gap-2 text-xs font-bold",
                state.outcome === "submitted" || state.outcome === "manual"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground",
              )}
            >
              {state.outcome === "submitted" || state.outcome === "manual" ? (
                <CircleCheck size={14} className="mt-0.5 shrink-0" />
              ) : (
                <CircleAlert size={14} className="mt-0.5 shrink-0" />
              )}
              {state.message}
            </p>
          )}
        </>
      )}

      {/* First-run ToS acknowledgement for this host */}
      {tosHost && (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="flex items-start gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            First run against {tosHost}
          </p>
          <p className="mt-2 text-[11px] font-medium text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
            Automated form-filling and submission on a third-party ATS can violate
            its terms of service and, on account-based sites, risk an account ban.
            Dayspring stays attended — you watch the window and approve every
            submission — but the risk is yours to accept, once per site.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={acceptTos}
              className={cn(btn, "bg-amber-600 text-white hover:bg-amber-700")}
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              I accept the risk for {tosHost}
            </button>
            <button
              type="button"
              onClick={() => setTosHost(null)}
              className={cn(btn, "border border-border bg-card text-foreground")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Live session */}
      {isActive && state && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-50/30 p-4 dark:bg-brand-950/10">
          <div className="flex items-center gap-2">
            {state.phase === "awaiting_review" || state.phase === "awaiting_verdict" ? (
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
                }[state.phase as Exclude<ApplyPhase, "done">]
              }
            </p>
          </div>
          <p className="mt-2 text-xs font-medium text-foreground leading-relaxed">{state.message}</p>

          {state.filled.length > 0 && (
            <p className="mt-2 text-[11px] font-medium text-muted-foreground">
              ✓ filled: {state.filled.join(", ")}
              {state.skipped.length > 0 && (
                <span className="block">– fill manually if present: {state.skipped.join(", ")}</span>
              )}
            </p>
          )}
          {state.resumeSource && (
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              Resume attached:{" "}
              {
                {
                  tailored: "tailored for this job",
                  master: "primary master",
                  settings: "fallback path",
                }[state.resumeSource]
              }
            </p>
          )}

          {/* Workday credential + OTP helpers */}
          {state.workday && state.phase === "awaiting_review" && (
            <div className="mt-3 space-y-2 rounded-lg border border-border bg-card p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                <KeyRound size={12} />
                {state.workday.existingUsername
                  ? `Account for this site: ${state.workday.existingUsername} — reveal the password in Settings → Vault.`
                  : state.workday.hasMaster
                    ? "No account here yet — register with your profile email + your master password, then vault it:"
                    : "Set a master password in Settings → Vault to use one-password signup."}
              </p>
              <div className="flex flex-wrap gap-2">
                {!state.workday.existingUsername && state.workday.hasMaster && (
                  <button
                    type="button"
                    disabled={pending || vaulted}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await vaultWorkdayAccountAction();
                        if (res.ok) setVaulted(true);
                        else setError(res.error);
                      })
                    }
                    className={cn(btn, "border border-border bg-card text-foreground text-xs px-3 py-1.5")}
                  >
                    {vaulted ? <Check size={12} /> : <KeyRound size={12} />}
                    {vaulted ? "Vaulted" : "I registered — vault it"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await readOtpAction();
                      if (res.ok) setOtp(res.code);
                      else setError(res.error);
                    })
                  }
                  className={cn(btn, "border border-border bg-card text-foreground text-xs px-3 py-1.5")}
                >
                  <MailCheck size={12} />
                  Read code from Gmail
                </button>
                {otp && (
                  <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-mono text-sm font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                    {otp}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Decision buttons */}
          {state.phase === "awaiting_review" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => decide(() => approveSubmitAction(jobId))}
                className={cn(btn, "bg-brand-500 text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600")}
              >
                {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                Approve &amp; Submit
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide(() => manualSubmittedAction(jobId))}
                className={cn(btn, "border border-border bg-card text-foreground")}
              >
                I clicked Submit myself
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide(() => cancelApplyAction(jobId))}
                className={cn(btn, "border border-border bg-card text-muted-foreground")}
              >
                <X size={14} />
                Cancel
              </button>
            </div>
          )}

          {state.phase === "awaiting_verdict" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => decide(() => verdictAction(jobId, true))}
                className={cn(btn, "bg-emerald-600 text-white hover:bg-emerald-700")}
              >
                <Check size={16} strokeWidth={3} />
                Yes — it submitted
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => decide(() => verdictAction(jobId, false))}
                className={cn(btn, "border border-border bg-card text-foreground")}
              >
                No — record as not submitted
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 text-xs font-medium text-destructive">
          <CircleAlert size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

type ApplyPhase = ApplySessionState["phase"];
