"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { scoreJobAction } from "@/lib/actions/score";
import { cn } from "@/lib/utils";

// Single-job Score / Rescore for the job detail page. The batch equivalent
// (feed header) lives in score-button.tsx.
export default function ScoreJobButton({
  jobId,
  force,
}: {
  jobId: string;
  force: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await scoreJobAction(jobId, force);
            if (!res.ok) setError(res.error);
          })
        }
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold shadow-sm transition-all active:scale-95",
          pending
            ? "bg-secondary text-muted-foreground cursor-not-allowed"
            : "bg-brand-500 text-white hover:bg-brand-600 shadow-brand-500/20 cursor-pointer",
        )}
      >
        {pending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : force ? (
          <RefreshCw size={16} />
        ) : (
          <Sparkles size={16} />
        )}
        {pending ? "Scoring…" : force ? "Rescore" : "Score"}
      </button>
      {error && !pending && (
        <p className="max-w-xs text-right text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
