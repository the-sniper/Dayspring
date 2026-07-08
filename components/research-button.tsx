"use client";

import { useState, useTransition } from "react";
import { Telescope, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { researchAction } from "@/lib/actions/research";
import { cn } from "@/lib/utils";

type Brief = {
  brief: string;
  sources: { title: string; url: string }[];
};

// Very small markdown-ish renderer for the brief prose: ## headings, - bullets,
// **bold**. Keeps a dependency out; the brief format is controlled by our prompt.
function renderBrief(md: string) {
  const lines = md.split("\n");
  return lines.map((line, i) => {
    const h = line.match(/^##+\s+(.*)/);
    if (h) {
      return (
        <h4
          key={i}
          className="mt-3 first:mt-0 text-[11px] font-black uppercase tracking-widest text-brand-600 dark:text-brand-400"
        >
          {h[1]}
        </h4>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-1.5" />;
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const text = bullet ? bullet[1] : line;
    const html = text.replace(
      /\*\*(.+?)\*\*/g,
      '<span class="font-bold text-foreground">$1</span>',
    );
    return (
      <p
        key={i}
        className={cn(
          "text-sm leading-relaxed text-muted-foreground",
          bullet && "pl-4 relative before:content-['·'] before:absolute before:left-1 before:text-brand-500",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });
}

export default function ResearchButton({
  subjectType,
  id,
  existing,
}: {
  subjectType: "job" | "company";
  id: number;
  existing: Brief | null;
}) {
  const [brief, setBrief] = useState<Brief | null>(existing);
  const [deep, setDeep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      setError(null);
      const res = await researchAction(subjectType, id, deep);
      if (res.ok) setBrief({ brief: res.brief, sources: res.sources });
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={run}
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold shadow-sm transition-all active:scale-95",
            pending
              ? "bg-secondary text-muted-foreground cursor-not-allowed"
              : "bg-brand-500 text-white hover:bg-brand-600 shadow-brand-500/20 cursor-pointer",
          )}
        >
          {pending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : brief ? (
            <RefreshCw size={16} />
          ) : (
            <Telescope size={16} />
          )}
          {pending
            ? "Researching…"
            : brief
              ? "Refresh research"
              : "Research"}
        </button>
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={deep}
            onChange={(e) => setDeep(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border text-brand-500 focus:ring-brand-500 cursor-pointer"
          />
          Deep (Opus, ~5× cost)
        </label>
      </div>

      {error && (
        <p className="text-xs font-medium text-destructive">{error}</p>
      )}

      {brief && (
        <div className="rounded-xl border border-border bg-secondary/20 p-4">
          <div className="space-y-0.5">{renderBrief(brief.brief)}</div>
          {brief.sources.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Sources
              </p>
              <div className="flex flex-wrap gap-2">
                {brief.sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    title={s.title}
                    className="inline-flex max-w-[220px] items-center gap-1 rounded-lg bg-card border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-brand-600 hover:border-brand-500/40 transition-colors"
                  >
                    <ExternalLink size={11} className="shrink-0" />
                    <span className="truncate">
                      {(() => {
                        try {
                          return new URL(s.url).hostname.replace(/^www\./, "");
                        } catch {
                          return s.title;
                        }
                      })()}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
