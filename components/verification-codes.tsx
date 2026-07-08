"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ShieldCheck,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  fetchRecentCodesAction,
  type OtpActionResult,
} from "@/lib/actions/otp";
import type { VerificationCode } from "@/lib/gmail/otp";

// Surfaces verification/OTP codes from the recent inbox with copy buttons.
// Useful for manual signups; the same core powers future auto-OTP.
export default function VerificationCodes({ hasGmail }: { hasGmail: boolean }) {
  const [codes, setCodes] = useState<VerificationCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const res: OtpActionResult = await fetchRecentCodesAction();
      if (res.ok) {
        setCodes(res.codes);
        setError(null);
      } else {
        setError(res.error);
      }
    });
  }

  // Auto-load once on mount when Gmail is connected.
  useEffect(() => {
    if (hasGmail) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGmail]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <ShieldCheck size={16} className="text-brand-500" />
          Verification codes
        </h3>
        {hasGmail && (
          <button
            type="button"
            onClick={load}
            disabled={pending}
            title="Refresh"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer disabled:opacity-50"
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </button>
        )}
      </div>

      {!hasGmail ? (
        <p className="text-xs font-medium text-muted-foreground leading-relaxed">
          Connect Gmail in Settings to surface sign-up codes here.
        </p>
      ) : error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : codes === null ? (
        <p className="text-xs font-medium text-muted-foreground">Checking inbox…</p>
      ) : codes.length === 0 ? (
        <p className="text-xs font-medium text-muted-foreground">
          No recent codes (last 20 min).
        </p>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <CodeRow key={c.messageId} code={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  return (m ? m[1] : from.replace(/[<>]/g, "")).trim();
}

function CodeRow({ code }: { code: VerificationCode }) {
  const [copied, setCopied] = useState(false);
  function copy(value: string) {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold text-muted-foreground">
          {senderName(code.from)}
        </p>
        {code.code ? (
          <p className="font-mono text-lg font-black tracking-widest text-foreground tabular-nums">
            {code.code}
          </p>
        ) : (
          <p className="text-xs font-medium text-muted-foreground">
            Magic link
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {code.link && (
          <a
            href={code.link}
            target="_blank"
            rel="noreferrer"
            title="Open verification link"
            className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors"
          >
            <ExternalLink size={14} />
          </a>
        )}
        {code.code && (
          <button
            type="button"
            onClick={() => copy(code.code!)}
            className="flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95 cursor-pointer"
          >
            {copied ? <Check size={12} strokeWidth={3} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}
