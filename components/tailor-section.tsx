"use client";

import { useState, useTransition } from "react";
import { tailorJobAction } from "@/lib/actions/tailor";

function CopyButton({ text, label = "copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
    >
      {copied ? "copied ✓" : label}
    </button>
  );
}

export default function TailorSection({
  jobId,
  bullets,
  coverLetter,
  tailoredAt,
}: {
  jobId: number;
  bullets: string[] | null;
  coverLetter: string | null;
  tailoredAt: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const has = !!(bullets?.length || coverLetter);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-foreground">Tailor</h2>
        {tailoredAt && (
          <span className="text-xs font-medium text-muted-foreground">
            drafted {tailoredAt.slice(0, 10)}
          </span>
        )}
        <span className="ml-auto">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res = await tailorJobAction(jobId);
                if (!res.ok) setError(res.error);
              })
            }
            className="rounded-[var(--radius)] bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-[var(--accent-foreground)] shadow-sm shadow-brand-500/20 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            {pending
              ? "Drafting… (~30s)"
              : has
                ? "Retailor"
                : "Tailor resume + cover letter"}
          </button>
        </span>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}
      {!has && !error && (
        <p className="mt-3 text-sm font-medium text-muted-foreground leading-relaxed">
          Opus drafts resume bullets angled at this JD plus a short cover
          letter — strictly from what your profile states, never invented.
        </p>
      )}

      {bullets && bullets.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Resume bullets
            </h3>
            <CopyButton text={bullets.map((b) => `• ${b}`).join("\n")} label="copy all" />
          </div>
          <ul className="mt-2 space-y-1.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-0.5 text-brand-500">•</span>
                <span className="flex-1">{b}</span>
                <CopyButton text={b} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {coverLetter && (
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Cover letter
            </h3>
            <CopyButton text={coverLetter} />
          </div>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-secondary/40 p-4 text-sm leading-relaxed text-foreground">
            {coverLetter}
          </p>
        </div>
      )}
    </section>
  );
}
