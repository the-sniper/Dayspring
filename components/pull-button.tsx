"use client";

import { useState, useTransition } from "react";
import { Download, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { pullJobsAction } from "@/lib/actions/pull";
import type { PullResult } from "@/lib/jobs/pull";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function PullButton() {
  const [result, setResult] = useState<PullResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await pullJobsAction());
          })
        }
        className={cn(
          "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all shadow-sm active:scale-95",
          pending 
            ? "bg-secondary text-muted-foreground cursor-not-allowed" 
            : "bg-primary text-primary-foreground hover:opacity-90 shadow-primary/10"
        )}
      >
        {pending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Pulling…
          </>
        ) : (
          <>
            <Download size={16} />
            Pull new jobs
          </>
        )}
      </button>
      
      <AnimatePresence>
        {result && !pending && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="max-w-md space-y-1 rounded-xl border border-border bg-card p-3 text-right text-xs shadow-xl"
          >
            <div className="flex items-center justify-end gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={14} />
              <span>Pull Complete</span>
            </div>
            <p className="text-muted-foreground">
              {result.perCompany
                .map(
                  (c) =>
                    `${c.name}: +${c.added}${
                      c.skipped > 0 ? ` (${c.skipped} non-US)` : ""
                    }`,
                )
                .join(" · ") || "no watched companies"}
            </p>
            {result.classified > 0 && (
              <p className="text-brand-600 dark:text-brand-400 font-medium">
                {result.classified} titles classified
              </p>
            )}
            {result.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.errors.map((e) => (
                  <div key={e.name} className="flex items-center justify-end gap-1 text-destructive font-medium">
                    <AlertCircle size={12} />
                    <span>{e.name}: {e.message}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
