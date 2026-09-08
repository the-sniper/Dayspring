"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LineChart, Loader2, Plus } from "lucide-react";
import Markdown from "@/components/markdown";
import {
  applyProposalAction,
  runStrategyReviewAction,
} from "@/lib/actions/campaign";
import type { StrategyProposal } from "@/lib/orchestra/strategy";
import { cn } from "@/lib/utils";

// Pulse's review, and the CEO's half of it: proposals arrive as buttons, and
// nothing lands in memory until one is pressed. An agent that could edit its
// own instructions is an agent that can drift without anyone noticing.

const TARGET_LABEL: Record<string, string> = {
  voiceDos: "Brand voice · do",
  voiceDonts: "Brand voice · don't",
  bannedTopics: "Banned topics",
  lessons: "Lessons",
  pillars: "Content pillars",
};

function ProposalRow({ proposal }: { proposal: StrategyProposal }) {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <li className="rounded-xl border border-border/70 bg-background p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
          {TARGET_LABEL[proposal.target] ?? proposal.target}
        </span>
        <p className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">
          {proposal.change}
        </p>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
        <span className="font-semibold">Evidence: </span>
        {proposal.evidence}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || state?.ok}
          onClick={() =>
            startTransition(async () => {
              const r = await applyProposalAction(proposal);
              setState({ ok: r.ok, text: r.message });
              router.refresh();
            })
          }
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : state?.ok ? (
            <Check size={12} strokeWidth={3} />
          ) : (
            <Plus size={12} strokeWidth={3} />
          )}
          {state?.ok ? "Applied" : "Apply to memory"}
        </button>
        {state && (
          <span
            className={cn(
              "text-[11px] font-semibold",
              state.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500",
            )}
          >
            {state.text}
          </span>
        )}
      </div>
    </li>
  );
}

export default function StrategyReviewPanel({
  memo,
  proposals,
  runDate,
  analystName,
}: {
  memo: string | null;
  proposals: StrategyProposal[];
  runDate: string | null;
  analystName: string;
}) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // The page owns the heading; this owns the run control and the output.
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] font-medium text-muted-foreground">
          {runDate ? (
            <>
              Last review <span className="font-bold text-foreground">{runDate}</span>.
              Re-run it after a few posts have numbers.
            </>
          ) : (
            <>
              No review yet. {analystName} needs at least one shipped post or
              one rejection to have anything to read.
            </>
          )}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await runStrategyReviewAction();
              setResult({ ok: r.ok, text: r.message });
              router.refresh();
            })
          }
          className="flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <LineChart size={14} />}
          {pending ? "Reviewing…" : "Run review"}
        </button>
      </div>
      {result && (
        <p
          className={cn(
            "mt-2 text-[12px] font-semibold",
            result.ok ? "text-muted-foreground" : "text-rose-500",
          )}
        >
          {result.text}
        </p>
      )}

      {memo && (
        <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-2xl bg-secondary/30 p-4">
          <Markdown text={memo} />
        </div>
      )}

      {proposals.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Proposed memory edits ({proposals.length})
          </p>
          <ul className="flex flex-col gap-2">
            {proposals.map((p, i) => (
              <ProposalRow key={`${p.target}-${i}`} proposal={p} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
