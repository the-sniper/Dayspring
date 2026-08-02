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
}: {
  action: keyof typeof ACTIONS;
  label: string;
  hint?: string;
  primary?: boolean;
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
    <div className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all active:scale-[0.98]",
          primary
            ? "bg-[var(--accent)] text-[var(--accent-foreground)] hover:brightness-105"
            : "border border-border text-muted-foreground hover:bg-muted",
          pending && "cursor-wait opacity-70",
        )}
      >
        {pending && <Loader2 size={13} className="animate-spin" />}
        {pending ? ACTIONS[action].pending : label}
      </button>
      {hint && (
        <p className="max-w-[240px] text-[10px] font-medium leading-snug text-muted-foreground/80">
          {hint}
        </p>
      )}
      {result && (
        <p
          className={cn(
            "max-w-[260px] text-[10px] font-semibold leading-snug",
            result.ok ? "text-muted-foreground" : "text-rose-500",
          )}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
