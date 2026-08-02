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
  roleNames,
}: {
  tiers: TierCard[];
  current: string;
  // Derived from the live registry by the server page — never hardcoded, so
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
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        {tiers.map((t) => {
          const active = t.id === current;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => choose(t.id)}
              disabled={pending}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-[1.75rem] border p-6 text-left shadow-lg transition-all duration-300 ease-out active:scale-[0.98]",
                active
                  ? "border-brand-500/60 bg-card ring-2 ring-inset ring-brand-500/20"
                  : "border-border/80 bg-card/50 hover:border-brand-500/40 hover:bg-card hover:shadow-xl",
                pending && !active && "opacity-60",
              )}
            >
              {active && (
                <div className="absolute -right-12 -top-12 h-24 w-24 rounded-full bg-brand-500/10 blur-2xl" />
              )}
              
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="font-display text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-400">
                    {t.label}
                  </span>
                  <p className="text-xs font-semibold text-muted-foreground/70">
                    {t.tagline}
                  </p>
                </div>
                {active ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 border border-brand-500/20 shadow-sm">
                    <Check size={12} strokeWidth={3} /> Active
                  </span>
                ) : switchingTo === t.id ? (
                  <Loader2 size={16} className="animate-spin text-brand-500" />
                ) : (
                  <div className="rounded-full border border-border/60 bg-secondary/50 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Check size={12} className="text-muted-foreground/40" />
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2.5 rounded-2xl bg-secondary/30 p-4 ring-1 ring-inset ring-black/5 dark:ring-white/5">
                {(
                  [
                    [roleNames.lead, t.models.lead],
                    [roleNames.worker, t.models.worker],
                    [roleNames.grunt, t.models.grunt],
                  ] as const
                ).map(([roles, model], idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4">
                    <span className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                      {roles}
                    </span>
                    <span className="shrink-0 rounded-lg bg-card/80 px-2 py-0.5 font-mono text-[10px] font-bold text-foreground shadow-sm ring-1 ring-inset ring-black/5 dark:ring-white/5">
                      {short(model)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Efficiency</span>
                  <span className="text-xs font-bold text-foreground">{t.estDaily}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                  {t.tradeoff}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="max-w-3xl text-[11px] font-medium leading-relaxed text-muted-foreground/60">
        Model switching applies to the <span className="text-foreground/80 underline decoration-brand-500/30">next orchestration run</span>. 
        Board context and charters are preserved. cheapest tiers should be calibrated against the 
        <span className="font-semibold text-foreground/80"> Golden Suite</span> before production use.
      </p>
      {result && (
        <div
          className={cn(
            "mt-4 rounded-xl px-4 py-3 text-xs font-semibold shadow-sm border animate-in fade-in slide-in-from-top-2",
            result.ok 
              ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/10" 
              : "bg-rose-500/5 text-rose-600 border-rose-500/10",
          )}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
