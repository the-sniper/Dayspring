"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Megaphone } from "lucide-react";
import { Button } from "@heroui/react";
import { motion, AnimatePresence } from "framer-motion";
import { pullLinkedinPostsAction } from "@/lib/actions/linkedin-posts";
import type { PostPullResult } from "@/lib/linkedin/pull";

function PullSummary({ result }: { result: PostPullResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="max-w-md space-y-1.5 rounded-xl border border-border bg-card p-3 text-right text-xs shadow-xl"
    >
      <div className="flex items-center justify-end gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={14} />
        <span>Search complete</span>
      </div>
      <p className="font-bold text-foreground">
        {result.hiring} hiring {result.hiring === 1 ? "post" : "posts"}
        <span className="font-medium text-muted-foreground">
          {" "}from {result.fetched} scanned
        </span>
      </p>
      {result.queries.length > 0 && (
        <p className="text-muted-foreground">{result.queries.join(" · ")}</p>
      )}
      {result.duplicates > 0 && (
        <p className="text-muted-foreground/70">
          {result.duplicates} already seen, skipped before extraction
        </p>
      )}
      {result.added > result.hiring && (
        <p className="text-muted-foreground/70">
          {result.added - result.hiring} weren&apos;t job posts
        </p>
      )}
      {result.limitReached && (
        <p className="font-medium text-brand-600 dark:text-brand-400">
          300-post batch limit reached
        </p>
      )}
      {result.errors.length > 0 && (
        <div className="space-y-1 text-destructive">
          <p className="flex items-center justify-end gap-1 font-medium">
            <AlertCircle size={12} />
            {result.errors.length} search
            {result.errors.length === 1 ? "" : "es"} failed (skipped)
          </p>
          {/* The reason, not just the count — a bad actor id or an out-of-credit
              token fails every search identically, and the count alone can't
              tell you which. */}
          <p className="break-words text-left font-mono text-[10px] leading-snug text-destructive/80">
            {result.errors[0].message}
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default function LinkedinPullButton() {
  const router = useRouter();
  const [result, setResult] = useState<PostPullResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="primary"
        isPending={pending}
        onPress={() =>
          startTransition(async () => {
            setError(null);
            setResult(null);
            const res = await pullLinkedinPostsAction();
            if (res.ok) setResult(res.result);
            else setError(res.error);
            router.refresh();
          })
        }
      >
        {({ isPending }) =>
          isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Searching…
            </>
          ) : (
            <>
              <Megaphone size={16} />
              Search posts
            </>
          )
        }
      </Button>

      <AnimatePresence>
        {result && !pending && <PullSummary result={result} />}
      </AnimatePresence>
      {error && !pending && (
        <p className="max-w-md rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-right text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
