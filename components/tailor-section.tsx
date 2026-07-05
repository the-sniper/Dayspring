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
      className="rounded border border-stone-300 px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100"
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
    <section className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Tailor</h2>
        {tailoredAt && (
          <span className="text-xs text-stone-400">
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
            className="rounded border border-amber-600 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {pending
              ? "Drafting… (~30s)"
              : has
                ? "Retailor"
                : "Tailor resume + cover letter"}
          </button>
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {!has && !error && (
        <p className="mt-2 text-sm text-stone-400">
          Opus drafts resume bullets angled at this JD plus a short cover
          letter — strictly from what your profile states, never invented.
        </p>
      )}

      {bullets && bullets.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Resume bullets
            </h3>
            <CopyButton text={bullets.map((b) => `• ${b}`).join("\n")} label="copy all" />
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-stone-400">•</span>
                <span className="flex-1">{b}</span>
                <CopyButton text={b} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {coverLetter && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Cover letter
            </h3>
            <CopyButton text={coverLetter} />
          </div>
          <p className="mt-1.5 whitespace-pre-wrap rounded bg-stone-50 p-3 text-sm leading-relaxed text-stone-700">
            {coverLetter}
          </p>
        </div>
      )}
    </section>
  );
}
