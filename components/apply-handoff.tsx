"use client";

import { useState } from "react";
import { Terminal, Copy, Check, CircleCheck, CircleAlert } from "lucide-react";

// The dashboard's role is only to HAND OFF: it copies the apply command and
// shows prereqs. The attended browser session runs in the user's terminal —
// keeping the human physically at the keyboard for CAPTCHAs + submit.
export default function ApplyHandoff({
  jobId,
  hasProfile,
  hasResume,
  hasTailored,
  applyStatus,
}: {
  jobId: number;
  hasProfile: boolean;
  hasResume: boolean;
  hasTailored: boolean;
  applyStatus: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const cmd = `npm run apply -- ${jobId}`;
  const ready = hasProfile;

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

  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Terminal size={16} className="text-brand-500" />
        <h3 className="text-sm font-bold text-foreground">Apply-assist</h3>
        {applyStatus && (
          <span className="rounded-md bg-secondary px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
            {applyStatus}
          </span>
        )}
      </div>
      <p className="mb-3 text-[11px] font-medium text-muted-foreground leading-relaxed">
        Runs an <span className="font-bold">attended</span> browser in your
        terminal: it autofills, then pauses for you to solve any CAPTCHA and to
        submit. Nothing is submitted automatically.
      </p>

      <ul className="mb-3 space-y-1">
        <Prereq ok={hasProfile} label="Profile set (fills name/email/links)" />
        <Prereq ok={hasResume} label="Resume PDF path set (auto-uploads)" />
        <Prereq ok={hasTailored} label="Tailored bullets + cover letter (optional)" />
      </ul>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs">
        <span className="flex-1 truncate text-foreground">{cmd}</span>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            void navigator.clipboard.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {!ready && (
        <p className="mt-2 text-[10px] font-bold text-amber-600">
          Set your profile in Settings before running apply-assist.
        </p>
      )}
    </div>
  );
}
