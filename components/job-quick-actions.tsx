"use client";

import { Check, X, Zap } from "lucide-react";
import { queueJobAction } from "@/lib/actions/apply-queue";
import { ignoreJobAction, promoteJobAction } from "@/lib/actions/jobs";
import Tip from "@/components/tip";

const iconBtn =
  "flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-95";

export default function JobQuickActions({
  jobId,
  showIgnore = true,
}: {
  jobId: string;
  showIgnore?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <form action={queueJobAction.bind(null, jobId)}>
        <Tip label="Add to auto-apply queue" placement="left">
          <button
            type="submit"
            className={`${iconBtn} border border-brand-500/40 bg-card text-brand-600 hover:bg-brand-500 hover:text-white dark:text-brand-400`}
          >
            <Zap size={15} strokeWidth={2.5} />
          </button>
        </Tip>
      </form>
      <form action={promoteJobAction.bind(null, jobId)}>
        <Tip label="Promote to wishlist" placement="left">
          <button
            type="submit"
            className={`${iconBtn} bg-brand-500 text-white shadow-sm shadow-brand-500/25 hover:bg-brand-600 hover:scale-105`}
          >
            <Check size={16} strokeWidth={3} />
          </button>
        </Tip>
      </form>
      {showIgnore && (
        <form action={ignoreJobAction.bind(null, jobId)}>
          <Tip label="Ignore role" placement="left">
            <button
              type="submit"
              className={`${iconBtn} border border-border bg-surface text-muted-foreground hover:border-destructive hover:text-destructive`}
            >
              <X size={16} strokeWidth={3} />
            </button>
          </Tip>
        </form>
      )}
    </div>
  );
}
