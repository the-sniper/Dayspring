"use client";

import { useState, useTransition } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import {
  backfillLevelsAction,
  enrichCompanySizesAction,
  setTargetSizeAction,
  syncCatalogAction,
} from "@/lib/actions/targeting";
import { MAX_HEADCOUNT_OPTIONS } from "@/shared/company-size";

type Coverage = {
  companies: number;
  companiesWithSize: number;
  jobs: number;
  jobsWithLevel: number;
};

// Targeting controls. The size ceiling is always shown because it governs what
// Pull ingests at all; the one-off setup buttons appear only while data is
// still missing.
export default function TargetingPanel({
  coverage,
  maxHeadcount,
}: {
  coverage: Coverage;
  maxHeadcount: number | null;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<string>) =>
    startTransition(async () => {
      setError(null);
      setMsg(null);
      try {
        setMsg(await fn());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    });

  const missingLevels = coverage.jobs - coverage.jobsWithLevel;
  const missingSizes = coverage.companies - coverage.companiesWithSize;
  const needsSetup = missingLevels > 0 || missingSizes > 0;

  return (
    <div className="mb-4 rounded-2xl border border-brand-300 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/20">
      <div className="flex items-start gap-2.5">
        <Crosshair size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">Targeting</p>

          <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="font-bold text-foreground">Pull only from companies:</span>
            <select
              disabled={pending}
              defaultValue={maxHeadcount === null ? "none" : String(maxHeadcount)}
              onChange={(e) =>
                run(async () => {
                  const raw = e.target.value;
                  const r = await setTargetSizeAction(
                    raw === "none" ? null : Number(raw),
                  );
                  if (!r.ok) throw new Error(r.error);
                  return "Saved. The next Pull will use this ceiling.";
                })
              }
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground"
            >
              {MAX_HEADCOUNT_OPTIONS.map(([value, label]) => (
                <option key={label} value={value === null ? "none" : String(value)}>
                  {label}
                </option>
              ))}
            </select>
            <span>
              Bigger boards post thousands of roles and would eat the whole
              per-pull budget.
            </span>
          </label>

          {needsSetup && (
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              The Level and Company size filters need this data. Jobs and
              companies missing it are never hidden — they just can&apos;t be
              filtered yet.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await syncCatalogAction();
                  if (!r.ok) throw new Error(r.error);
                  return `Catalog synced: ${r.added} companies added, ${r.watched} updated. Run a Pull to fetch their jobs.`;
                })
              }
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              Add new startups from catalog
            </button>

            {missingLevels > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await backfillLevelsAction();
                    if (!r.ok) throw new Error(r.error);
                    return r.remaining > 0
                      ? `Tagged ${r.updated} jobs; ${r.remaining} continuing in the background — reload in a moment.`
                      : `Tagged ${r.updated} jobs with a seniority level. Done.`;
                  })
                }
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Tag {missingLevels.toLocaleString()} jobs by level (free)
              </button>
            )}

            {missingSizes > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const r = await enrichCompanySizesAction();
                    if (!r.ok) throw new Error(r.error);
                    return `Sized ${r.enriched} companies (${r.spent} Apollo credits). ${r.remaining} still missing — click again to continue.`;
                  })
                }
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Size {missingSizes} companies via Apollo (1 credit each)
              </button>
            )}
          </div>

          {pending && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Working…
            </p>
          )}
          {msg && (
            <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {msg}
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
