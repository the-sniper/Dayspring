"use client";

import { useTransition } from "react";
import { setJobStatusAction } from "@/lib/actions/jobs";
import { KANBAN_STATUSES, type JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2 } from "lucide-react";

export default function StatusSelect({
  jobId,
  status,
  statuses = KANBAN_STATUSES,
}: {
  jobId: string;
  status: JobStatus;
  statuses?: readonly JobStatus[];
}) {
  const [pending, startTransition] = useTransition();
  const options = statuses.includes(status) ? statuses : [status, ...statuses];
  
  return (
    <div className="relative inline-block">
      <select
        value={status}
        disabled={pending}
        onChange={(e) => {
          const to = e.target.value as JobStatus;
          startTransition(() => {
            void setJobStatusAction(jobId, to);
          });
        }}
        className={cn(
          "appearance-none rounded-lg border border-border bg-card px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-50 pr-6 cursor-pointer",
          pending && "animate-pulse"
        )}
        aria-label="Job status"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50">
        {pending ? <Loader2 size={10} className="animate-spin" /> : <ChevronDown size={10} />}
      </div>
    </div>
  );
}
