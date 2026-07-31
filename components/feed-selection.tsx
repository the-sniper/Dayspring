"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useRef, useState, useTransition } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteJobsAction } from "@/lib/actions/jobs";

export default function FeedSelection({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function rowCheckboxes(): HTMLInputElement[] {
    return Array.from(
      rootRef.current?.querySelectorAll<HTMLInputElement>(
        "input[data-job-checkbox]",
      ) ?? [],
    );
  }

  function syncSelection() {
    const boxes = rowCheckboxes();
    const count = boxes.filter((box) => box.checked).length;
    const selectAll =
      rootRef.current?.querySelector<HTMLInputElement>(
        "input[data-select-all]",
      );
    if (selectAll) {
      selectAll.checked = boxes.length > 0 && count === boxes.length;
      selectAll.indeterminate = count > 0 && count < boxes.length;
    }
    setSelected(count);
  }

  function clearSelection() {
    for (const box of rowCheckboxes()) box.checked = false;
    syncSelection();
  }

  function handleChange(event: ChangeEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.selectAll !== undefined) {
      for (const box of rowCheckboxes()) box.checked = target.checked;
    }
    syncSelection();
  }

  function removeSelected() {
    const ids = rowCheckboxes()
      .filter((box) => box.checked)
      .map((box) => box.dataset.jobId)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Permanently delete ${ids.length} selected job${ids.length === 1 ? "" : "s"}? This also removes their application history and generated files.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await deleteJobsAction(ids);
        clearSelection();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete jobs.");
      }
    });
  }

  return (
    <div ref={rootRef} onChange={handleChange}>
      {selected > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm font-bold text-foreground" aria-live="polite">
            {selected} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <X size={14} />
              Clear
            </button>
            <button
              type="button"
              onClick={removeSelected}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-white shadow-sm transition-all hover:brightness-95 active:scale-95 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              {pending ? "Deleting…" : "Delete selected"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mb-3 text-sm font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}
      {children}
    </div>
  );
}
