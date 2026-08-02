"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hammer, Loader2 } from "lucide-react";
import {
  fileEngRequestAction,
  type OrchestraActionResult,
} from "@/lib/actions/orchestra";
import { cn } from "@/lib/utils";

export default function EngRequestForm() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<OrchestraActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setResult(null);
    startTransition(async () => {
      const r = await fileEngRequestAction(text.trim());
      setResult(r);
      if (r.ok) setText("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <Hammer size={13} /> Request eng work
      </h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Describe a Dayspring feature or fix (owner-only — this is your dev team). File it, then hit 'Run Forge' in Operations to get a spec."
        className="mt-2 w-full resize-y rounded-xl border border-border bg-background p-2.5 text-[13px] text-foreground focus:border-brand-500/50 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || text.trim().length < 10}
          onClick={submit}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105 disabled:opacity-50"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Hammer size={13} />}
          File request
        </button>
        {result && (
          <p
            className={cn(
              "text-[11px] font-semibold",
              result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500",
            )}
          >
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}
