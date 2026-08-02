"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  freezeGoldenAction,
  runCalibrationAction,
  runForgeAction,
  runProbeAction,
  runRetroAction,
  type OrchestraActionResult,
} from "@/lib/actions/orchestra";
import { cn } from "@/lib/utils";

const ACTIONS = {
  retro: { fn: runRetroAction, pending: "Running retro…" },
  forge: { fn: runForgeAction, pending: "Forge is reading the repo…" },
  probe: { fn: runProbeAction, pending: "Layer 0 + Probe review…" },
  freeze: { fn: freezeGoldenAction, pending: "Freezing today…" },
  calibrate: { fn: runCalibrationAction, pending: "Running suite (minutes)…" },
} as const;

export default function OpsButton({
  action,
  label,
  hint,
  primary = false,
  className,
}: {
  action: keyof typeof ACTIONS;
  label: string;
  hint?: string;
  primary?: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OrchestraActionResult | null>(null);
  const router = useRouter();

  function run() {
    setResult(null);
    startTransition(async () => {
      const r = await ACTIONS[action].fn();
      setResult(r);
      router.refresh();
    });
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all active:scale-[0.98]",
          primary
            ? "bg-brand-500 text-white shadow-sm shadow-brand-500/20 hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-500"
            : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          pending && "cursor-wait opacity-70",
        )}
      >
        {pending && <Loader2 size={13} className="animate-spin" />}
        {pending ? ACTIONS[action].pending : label}
      </button>
      {hint && (
        <p className="text-[10px] font-medium leading-relaxed text-muted-foreground/70">
          {hint}
        </p>
      )}
      {result && (
        <p
          className={cn(
            "text-[10px] font-semibold leading-snug",
            result.ok ? "text-brand-600 dark:text-brand-400" : "text-rose-500",
          )}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
