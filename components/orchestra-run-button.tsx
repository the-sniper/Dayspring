"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2 } from "lucide-react";
import {
  runOrchestraAction,
  type OrchestraActionResult,
} from "@/lib/actions/orchestra";
import { cn } from "@/lib/utils";

export default function OrchestraRunButton({
  alreadyRan,
}: {
  alreadyRan: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OrchestraActionResult | null>(null);
  const router = useRouter();

  function run() {
    setResult(null);
    startTransition(async () => {
      const r = await runOrchestraAction();
      setResult(r);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cn(
          "flex h-10 items-center gap-2 rounded-[var(--radius)] px-4 text-sm font-medium shadow-sm transition-all active:scale-[0.98]",
          pending
            ? "cursor-wait bg-secondary text-muted-foreground"
            : "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-brand-500/20 hover:brightness-105",
        )}
      >
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Running… (a few minutes)
          </>
        ) : (
          <>
            <Play size={16} strokeWidth={2.75} />
            {alreadyRan ? "Re-check today" : "Run today"}
          </>
        )}
      </button>
      {result && (
        <p
          className={cn(
            "max-w-xs text-right text-[11px] font-medium",
            result.ok ? "text-muted-foreground" : "text-rose-500",
          )}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
