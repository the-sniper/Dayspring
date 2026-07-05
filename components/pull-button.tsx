"use client";

import { useState, useTransition } from "react";
import { pullJobsAction } from "@/lib/actions/pull";
import type { PullResult } from "@/lib/jobs/pull";

export default function PullButton() {
  const [result, setResult] = useState<PullResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await pullJobsAction());
          })
        }
        className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {pending ? "Pulling…" : "Pull new jobs"}
      </button>
      {result && !pending && (
        <p className="max-w-md text-right text-xs text-stone-500">
          {result.perCompany
            .map((c) => `${c.name}: +${c.added} of ${c.fetched}`)
            .join(" · ") || "no watched companies"}
          {result.errors.map((e) => (
            <span key={e.name} className="block text-red-600">
              {e.name}: {e.message}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
