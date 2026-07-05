"use client";

import { useTransition } from "react";
import { setJobStatusAction } from "@/lib/actions/jobs";
import { KANBAN_STATUSES, type JobStatus } from "@/lib/types";

export default function StatusSelect({
  jobId,
  status,
  statuses = KANBAN_STATUSES,
}: {
  jobId: number;
  status: JobStatus;
  statuses?: readonly JobStatus[];
}) {
  const [pending, startTransition] = useTransition();
  // Always render the current status even when it isn't in the offered list
  // (e.g. a `new` job shown with kanban-only options).
  const options = statuses.includes(status) ? statuses : [status, ...statuses];
  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => {
        const to = e.target.value as JobStatus;
        startTransition(() => {
          void setJobStatusAction(jobId, to);
        });
      }}
      className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-xs text-stone-700 disabled:opacity-50"
      aria-label="Job status"
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
