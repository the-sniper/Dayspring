"use client";

import { useState, useTransition } from "react";
import { scoreJobAction, scoreUnscoredAction } from "@/lib/actions/score";

// Two modes: batch (no jobId — "Score unscored (N)") and single job
// (jobId set — "Score" / "Rescore" on the detail page).
export default function ScoreButton({
  jobId,
  force = false,
  unscoredCount,
  label,
}: {
  jobId?: number;
  force?: boolean;
  unscoredCount?: number;
  label?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  const batchLabel =
    unscoredCount !== undefined ? `Score unscored (${unscoredCount})` : "Score unscored";
  const text = label ?? (jobId ? (force ? "Rescore" : "Score") : batchLabel);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending || (jobId === undefined && unscoredCount === 0)}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            if (jobId !== undefined) {
              const res = await scoreJobAction(jobId, force);
              setIsError(!res.ok);
              setMessage(res.ok ? `Scored: ${res.score}` : res.error);
            } else {
              const res = await scoreUnscoredAction();
              if (!res.ok) {
                setIsError(true);
                setMessage(res.error);
              } else {
                setIsError(res.failed > 0);
                setMessage(
                  `${res.scored} scored` +
                    (res.failed ? `, ${res.failed} failed` : "") +
                    (res.skippedThinJd ? `, ${res.skippedThinJd} thin-JD skipped` : "") +
                    (res.remaining ? `, ${res.remaining} still unscored` : "") +
                    ` · ${(res.tokens.input / 1000).toFixed(1)}k in / ${(res.tokens.output / 1000).toFixed(1)}k out tokens` +
                    (res.errors.length ? ` · ${res.errors[0]}` : ""),
                );
              }
            }
          })
        }
        className="rounded border border-amber-600 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
      >
        {pending ? "Scoring…" : text}
      </button>
      {message && !pending && (
        <p
          className={`max-w-sm text-right text-xs ${isError ? "text-red-600" : "text-stone-500"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
