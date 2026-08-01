"use client";

import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { savePostQueriesAction } from "@/lib/actions/linkedin-posts";
import { MAX_POST_QUERIES } from "@/shared/linkedin-posts";

// The search terms the post source runs. Each term is a separate paid provider
// run, which is why the count is capped and shown.
export default function LinkedinQueriesPanel({
  queries,
  isDefault,
  hasKey,
  lastPullAt,
}: {
  queries: string[];
  isDefault: boolean;
  hasKey: boolean;
  lastPullAt: string | null;
}) {
  const [value, setValue] = useState(queries.join(", "));
  const [saved, setSaved] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const res = await savePostQueriesAction(value);
      if (res.ok) {
        setSaved(res.queries);
        setValue(res.queries.join(", "));
      } else setError(res.error);
    });
  }

  return (
    <div className="mb-4 rounded-2xl border border-brand-300 bg-brand-50/50 p-4 dark:border-brand-800 dark:bg-brand-950/20">
      <div className="flex items-start gap-2.5">
        <Search size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">Post search terms</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Comma-separated. Each term is one scraping run, so up to{" "}
            {MAX_POST_QUERIES} are used.
            {isDefault && " These defaults come from your onboarding role types."}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="hiring Frontend, we're hiring Data"
              aria-label="LinkedIn post search terms"
              className="min-w-[240px] flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="button"
              disabled={pending || !value.trim()}
              onClick={save}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-brand-500 active:scale-95 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                "Save terms"
              )}
            </button>
          </div>

          {!hasKey && (
            <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              Add your Apify API token in Settings → API Keys to run post
              searches. LinkedIn has no public post-search API, so this source
              goes through a third-party scraper.
            </p>
          )}
          {saved && (
            <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Saved {saved.length} term{saved.length === 1 ? "" : "s"}. The next
              search will use them.
            </p>
          )}
          {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
          {lastPullAt && (
            <p className="mt-2 text-[11px] font-medium text-muted-foreground/70">
              Last searched {lastPullAt.slice(0, 16).replace("T", " ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
