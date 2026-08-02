"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitPullRequest, Hammer, Loader2 } from "lucide-react";
import {
  fileEngRequestAction,
  type OrchestraActionResult,
} from "@/lib/actions/orchestra";
import Markdown from "@/components/markdown";
import { fmtDate } from "@/lib/orchestra/format";
import { cn } from "@/lib/utils";

export type RetroProposal = {
  target: string;
  change: string;
  evidence: string;
  expectedEffect: string;
};

// Renders the latest weekly retro + one-click "file as eng request" per
// proposal — so a merged proposal flows through Forge → Mason → Probe like
// any other change (self-improvement stays inside the accountability spine).
export default function RetroPanel({
  runDate,
  memo,
  proposals,
}: {
  runDate: string;
  memo: string;
  proposals: RetroProposal[];
}) {
  const [results, setResults] = useState<Record<number, OrchestraActionResult>>({});
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function file(i: number, p: RetroProposal) {
    setPendingIdx(i);
    startTransition(async () => {
      const r = await fileEngRequestAction(
        `Apply retro proposal (${p.target}): ${p.change}\n\nEvidence: ${p.evidence}\nExpected effect: ${p.expectedEffect}\n\nCharters live in lib/orchestra/charters.ts; keep the edited charter ≤60 lines.`,
      );
      setResults((s) => ({ ...s, [i]: r }));
      setPendingIdx(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <GitPullRequest size={13} className="text-muted-foreground" />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Weekly retro · {fmtDate(runDate)}
        </h3>
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto">
        <Markdown text={memo} />
      </div>
      {proposals.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3">
          {proposals.map((p, i) => (
            <div key={i} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">
                  {p.target}: {p.change}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Evidence: {p.evidence}
                </p>
              </div>
              {results[i]?.ok ? (
                <span className="shrink-0 text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                  filed
                </span>
              ) : (
                <button
                  type="button"
                  disabled={pendingIdx === i}
                  onClick={() => file(i, p)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted",
                  )}
                >
                  {pendingIdx === i ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Hammer size={11} />
                  )}
                  Merge via eng
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
