"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import {
  setTierAction,
  type OrchestraActionResult,
} from "@/lib/actions/orchestra";
import { cn } from "@/lib/utils";

// Serializable tier shape passed down from the server page (no lib imports
// here — this file ships to the client).
export type TierCard = {
  id: string;
  label: string;
  tagline: string;
  models: { lead: string; worker: string; grunt: string };
  estDaily: string;
  tradeoff: string;
};

const MODEL_SHORT: Record<string, string> = {
  "claude-opus-5": "Opus 5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-haiku-4-5": "Haiku 4.5",
};

function short(model: string): string {
  return MODEL_SHORT[model] ?? model;
}

export default function TierSwitcher({
  tiers,
  current,
}: {
  tiers: TierCard[];
  current: string;
}) {
  const [pending, startTransition] = useTransition();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [result, setResult] = useState<OrchestraActionResult | null>(null);
  const router = useRouter();

  function choose(id: string) {
    if (id === current || pending) return;
    setSwitchingTo(id);
    setResult(null);
    startTransition(async () => {
      const r = await setTierAction(id);
      setResult(r);
      setSwitchingTo(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        {tiers.map((t) => {
          const active = t.id === current;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => choose(t.id)}
              disabled={pending}
              className={cn(
                "flex flex-col rounded-2xl border p-4 text-left shadow-sm transition-all",
                active
                  ? "border-brand-500/60 bg-card ring-2 ring-inset ring-brand-500/30"
                  : "border-border bg-card hover:border-brand-500/40 hover:shadow-md",
                pending && !active && "opacity-60",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-foreground">
                  {t.label}
                </span>
                {active ? (
                  <span className="flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                    <Check size={11} strokeWidth={3} /> active
                  </span>
                ) : switchingTo === t.id ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                {t.tagline}
              </p>
              <div className="mt-3 flex flex-col gap-1 text-[12px]">
                {(
                  [
                    ["Leads (Atlas, Sentinel)", t.models.lead],
                    ["Workers (Radar, …)", t.models.worker],
                    ["Grunt (Pulse, …)", t.models.grunt],
                  ] as const
                ).map(([label, model]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                      {short(model)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[12px] font-semibold text-foreground">
                {t.estDaily}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {t.tradeoff}
              </p>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] font-medium text-muted-foreground">
        Switching applies from the next run — an in-flight run keeps its models.
        All board context (tasks, artifacts, reports, memory) lives in Convex
        and is model-independent, and charters are identical across tiers, so
        nothing is lost: the prompt cache simply re-warms once on the new model
        (about a cent). Before trusting a cheaper tier, run{" "}
        <code className="rounded bg-secondary px-1 font-mono text-[10px]">
          npm run orchestra:eval
        </code>{" "}
        — it evaluates the active tier against the golden suite.
      </p>
      {result && (
        <p
          className={cn(
            "mt-2 text-[12px] font-semibold",
            result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500",
          )}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
