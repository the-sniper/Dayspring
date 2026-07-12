"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@heroui/react";
import { scoreUnscoredAction } from "@/lib/actions/score";
import { motion, AnimatePresence } from "framer-motion";

export default function ScoreButton({ unscoredCount }: { unscoredCount: number }) {
  const [result, setResult] = useState<{
    scored: number;
    errors: number;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  if (unscoredCount === 0 && !result) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="secondary"
        isPending={pending}
        isDisabled={unscoredCount === 0}
        onPress={() =>
          startTransition(async () => {
            const res = await scoreUnscoredAction();
            if (res.ok) {
              setResult({ scored: res.scored, errors: res.failed });
            } else {
              alert(res.error);
            }
          })
        }
      >
        {({ isPending }) =>
          isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Scoring…
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Score unscored ({unscoredCount})
            </>
          )
        }
      </Button>

      <AnimatePresence>
        {result && !pending && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="max-w-md space-y-1 rounded-xl border border-border bg-card p-3 text-right text-xs shadow-xl"
          >
            <div className="flex items-center justify-end gap-1.5 font-bold text-brand-600 dark:text-brand-400">
              <CheckCircle2 size={14} />
              <span>Scoring Complete</span>
            </div>
            <p className="text-muted-foreground font-medium">
              {result.scored} jobs scored
              {result.errors > 0 && (
                <span className="text-destructive ml-1">
                  · {result.errors} errors
                </span>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
