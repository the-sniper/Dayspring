"use client";

import { useState, useTransition } from "react";
import { Download, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@heroui/react";
import { pullJobsAction } from "@/lib/actions/pull";
import type { PullResult } from "@/lib/jobs/pull";
import { motion, AnimatePresence } from "framer-motion";

// Sources can now number in the hundreds, so we summarize totals + the top
// contributors rather than dumping every company.
function PullSummary({ result }: { result: PullResult }) {
  const totalAdded = result.perCompany.reduce((n, c) => n + c.added, 0);
  const totalSkipped = result.perCompany.reduce((n, c) => n + c.skipped, 0);
  const sourcesFetched = result.perCompany.filter((c) => c.fetched > 0).length;
  const top = [...result.perCompany]
    .filter((c) => c.added > 0)
    .sort((a, b) => b.added - a.added)
    .slice(0, 8);
  const moreCount = result.perCompany.filter((c) => c.added > 0).length - top.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="max-w-md space-y-1.5 rounded-xl border border-border bg-card p-3 text-right text-xs shadow-xl"
    >
      <div className="flex items-center justify-end gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={14} />
        <span>Pull Complete</span>
      </div>
      <p className="font-bold text-foreground">
        {totalAdded} new {totalAdded === 1 ? "job" : "jobs"}
        <span className="font-medium text-muted-foreground">
          {" "}from {sourcesFetched} {sourcesFetched === 1 ? "source" : "sources"}
        </span>
      </p>
      {top.length > 0 && (
        <p className="text-muted-foreground">
          {top.map((c) => `${c.name}: +${c.added}`).join(" · ")}
          {moreCount > 0 && ` · +${moreCount} more`}
        </p>
      )}
      {totalSkipped > 0 && (
        <p className="text-muted-foreground/70">{totalSkipped} non-US skipped</p>
      )}
      {result.classified > 0 && (
        <p className="font-medium text-brand-600 dark:text-brand-400">
          {result.classified} titles classified
        </p>
      )}
      {result.errors.length > 0 && (
        <p className="flex items-center justify-end gap-1 font-medium text-destructive">
          <AlertCircle size={12} />
          {result.errors.length} source{result.errors.length === 1 ? "" : "s"} failed (skipped)
        </p>
      )}
    </motion.div>
  );
}

export default function PullButton() {
  const [result, setResult] = useState<PullResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="primary"
        isPending={pending}
        onPress={() =>
          startTransition(async () => {
            setResult(await pullJobsAction());
          })
        }
      >
        {({ isPending }) =>
          isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Pulling…
            </>
          ) : (
            <>
              <Download size={16} />
              Pull new jobs
            </>
          )
        }
      </Button>
      
      <AnimatePresence>
        {result && !pending && <PullSummary result={result} />}
      </AnimatePresence>
    </div>
  );
}
