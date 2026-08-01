"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, Loader2, RefreshCw, Wallet } from "lucide-react";
import {
  fetchProviderBalancesAction,
  type ProviderBalancesResult,
} from "@/lib/actions/usage";
import type { ProviderUsageRow } from "@/lib/usage/balances";
import { cn } from "@/lib/utils";

export default function ApiUsagePanel() {
  const [rows, setRows] = useState<ProviderUsageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const res: ProviderBalancesResult = await fetchProviderBalancesAction();
      if (res.ok) {
        setRows(res.rows);
        setError(null);
      } else {
        setError(res.error);
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 p-4 border-b border-border">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-muted-foreground">
          <Wallet size={16} strokeWidth={3} className="text-brand-500" />
          API balances
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={pending}
          title="Refresh"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
        </button>
      </div>

      {error && (
        <p className="px-4 py-3 text-xs font-medium text-destructive">{error}</p>
      )}

      {rows === null && !error && (
        <div className="flex items-center gap-2 px-4 py-8 text-xs font-medium text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Checking connected accounts…
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="p-6 text-center">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            No API keys connected
          </p>
          <a
            href="/settings"
            className="mt-2 inline-block text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Add keys in Settings
          </a>
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">{row.label}</p>
                {row.primary ? (
                  <>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                      {row.primary}
                    </p>
                    {row.detail && (
                      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                        {row.detail}
                      </p>
                    )}
                  </>
                ) : (
                  <p
                    className={cn(
                      "mt-0.5 text-[11px] font-medium leading-snug",
                      row.note?.startsWith("Couldn’t")
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {row.note ?? "—"}
                  </p>
                )}
              </div>
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                title={`${row.label} billing`}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <ExternalLink size={14} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
