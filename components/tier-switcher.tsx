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
// here - this file ships to the client).
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
  roleNames,
}: {
  tiers: TierCard[];
  current: string;
  // Derived from the live registry by the server page - never hardcoded, so
  // the labels can't drift from the actual org chart.
  roleNames: { lead: string; worker: string; grunt: string };
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
    <div className="space-y-5">
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
                "group surface-lift flex flex-col rounded-[1.35rem] border p-5 text-left transition-colors active:scale-[0.98]",
                active
                  ? "border-brand-500/50 bg-brand-500/[0.06]"
                  : "border-border/55 hover:border-brand-500/30",
                pending && !active && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <span className="font-display text-lg font-bold tracking-tight text-foreground">
                    {t.label}
                  </span>
                  <p className="text-xs font-medium text-muted-foreground">
                    {t.tagline}
                  </p>
                </div>
                {active ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                    <Check size={11} strokeWidth={3} /> Active
                  </span>
                ) : switchingTo === t.id ? (
                  <Loader2 size={16} className="animate-spin text-brand-500" />
                ) : null}
              </div>

              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border/40 bg-secondary/30 p-3">
                {(
                  [
                    [roleNames.lead, t.models.lead],
                    [roleNames.worker, t.models.worker],
                    [roleNames.grunt, t.models.grunt],
                  ] as const
                ).map(([roles, model], idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3">
                    <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {roles}
                    </span>
                    <span className="shrink-0 rounded-md bg-card px-2 py-0.5 font-mono text-[10px] font-bold text-foreground">
                      {short(model)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Est. daily
                  </span>
                  <span className="text-xs font-bold text-foreground">{t.estDaily}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t.tradeoff}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
        Switching applies to the next orchestration run. Board context and
        charters stay put. Calibrate cheaper tiers against the golden suite
        before you rely on them.
      </p>
      {result && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-xs font-semibold",
            result.ok
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-400",
          )}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
