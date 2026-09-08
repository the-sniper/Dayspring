"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, SlidersHorizontal, X } from "lucide-react";
import { setTodayCapAction } from "@/lib/actions/orchestra";
import { cn } from "@/lib/utils";

// Raising the ceiling is a decision, so it looks like one: you type a number,
// you see what it costs you, and it expires by itself tonight. The standing cap
// in env is never touched — tomorrow is back to normal without anyone
// remembering to undo anything.

export default function SpendCapControl({
  cap,
  standingCap,
  overridden,
}: {
  cap: number;
  standingCap: number;
  overridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(Math.max(cap, standingCap * 2)));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function apply(usd: number | null) {
    setMsg(null);
    startTransition(async () => {
      const r = await setTodayCapAction(usd);
      setMsg(r.ok ? null : r.message);
      if (r.ok) setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Change today's spending ceiling"
        className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
      >
        <SlidersHorizontal size={12} />
      </button>
    );
  }

  return (
    <div className="absolute right-3 top-3 z-10 w-56 rounded-xl border border-border bg-card p-3 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Today&apos;s ceiling
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
        >
          <X size={12} />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-sm font-bold text-muted-foreground">$</span>
        <input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-semibold text-foreground focus:border-brand-500/50 focus:outline-none"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => apply(Number(value))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-brand-950 transition-colors hover:bg-brand-400 disabled:opacity-50 active:scale-[0.98]"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        Applies to today only. It expires at the next reset and the standing
        cap (${standingCap.toFixed(2)}) comes back on its own.
      </p>
      {overridden && (
        <button
          type="button"
          disabled={pending}
          onClick={() => apply(null)}
          className={cn(
            "mt-2 w-full rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted",
            pending && "opacity-50",
          )}
        >
          Back to ${standingCap.toFixed(2)} now
        </button>
      )}
      {msg && <p className="mt-1.5 text-[10px] font-semibold text-rose-500">{msg}</p>}
    </div>
  );
}
