"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Search,
  Loader2,
  ExternalLink,
  AtSign,
  Mail,
  Trash2,
  Building2,
  Sparkles,
  Info,
  X,
} from "lucide-react";
import {
  askContactsAction,
  deleteContactAction,
  searchLocalContactsAction,
} from "@/lib/actions/contacts";
import type { ContactRow } from "@/lib/contacts/query";
import { cn } from "@/lib/utils";

const SOURCE_STYLE: Record<string, string> = {
  linkedin: "bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400",
  apollo: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  happenstance: "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400",
  manual: "bg-secondary text-muted-foreground",
};

type AiState = {
  rows: (ContactRow & { reason: string })[];
  caveat: string | null;
  query: string;
} | null;

export default function ContactSearch({
  initial,
  total,
  hasApiKey,
}: {
  initial: ContactRow[];
  total: number;
  hasApiKey: boolean;
}) {
  const [rows, setRows] = useState<ContactRow[]>(initial);
  const [q, setQ] = useState("");
  const [ai, setAi] = useState<AiState>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [filtering, startFilter] = useTransition();
  const [asking, startAsk] = useTransition();

  function filter(query: string) {
    setAi(null);
    setAiError(null);
    startFilter(async () => setRows(await searchLocalContactsAction(query)));
  }

  function ask() {
    if (!q.trim()) return;
    setAiError(null);
    startAsk(async () => {
      const res = await askContactsAction(q);
      if (res.ok) setAi({ rows: res.rows, caveat: res.caveat, query: q });
      else setAiError(res.error);
    });
  }

  const showingAi = ai !== null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                filter(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hasApiKey) ask();
              }}
              placeholder='Filter, or ask — "recruiters hiring fullstack devs"'
              className="w-full rounded-xl border border-border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50"
            />
            {filtering ? (
              <Loader2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground/50" />
            ) : (
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            )}
          </div>
          <button
            type="button"
            disabled={asking || !q.trim() || !hasApiKey}
            onClick={ask}
            title={hasApiKey ? "Answer this as a question over all your contacts" : "Needs ANTHROPIC_API_KEY"}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {asking ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Ask AI
          </button>
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
          Type to filter instantly · press Enter or Ask AI to search by meaning
          across all {total} contacts
          {!hasApiKey && " (Ask AI needs ANTHROPIC_API_KEY)"}
        </p>
      </div>

      {aiError && <p className="text-xs font-medium text-destructive">{aiError}</p>}

      {showingAi ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-foreground">
              <Sparkles size={12} className="inline -mt-0.5 mr-1 text-brand-500" />
              {ai.rows.length} match{ai.rows.length === 1 ? "" : "es"} for &ldquo;{ai.query}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => {
                setAi(null);
                filter(q);
              }}
              className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X size={12} />
              Back to browse
            </button>
          </div>
          {ai.caveat && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50/50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              <Info size={14} className="mt-0.5 shrink-0" />
              {ai.caveat}
            </div>
          )}
          {ai.rows.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">No contacts matched that.</p>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-secondary/10 overflow-hidden">
              {ai.rows.map((c) => (
                <ContactRowView
                  key={c.id}
                  c={c}
                  reason={c.reason}
                  onDeleted={() => setAi((s) => (s ? { ...s, rows: s.rows.filter((r) => r.id !== c.id) } : s))}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-xs font-medium text-muted-foreground">
            {q ? `${rows.length} match${rows.length === 1 ? "" : "es"}` : `${total} contacts`}
            {!q && total > rows.length && ` · showing ${rows.length} most recent — search to find any`}
          </p>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-center">
              {q ? (
                <>
                  <p className="text-sm font-medium text-muted-foreground">
                    No exact matches for &ldquo;{q}&rdquo; — but AI can search by
                    meaning (e.g. infer a company&apos;s city, or related roles).
                  </p>
                  <button
                    type="button"
                    disabled={asking || !hasApiKey}
                    onClick={ask}
                    className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {asking ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    Ask AI about &ldquo;{q.length > 30 ? q.slice(0, 30) + "…" : q}&rdquo;
                  </button>
                  {!hasApiKey && (
                    <p className="text-[11px] text-muted-foreground">Needs ANTHROPIC_API_KEY (Settings).</p>
                  )}
                </>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">
                  No contacts yet — import your LinkedIn connections.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-secondary/10 overflow-hidden">
              {rows.map((c) => (
                <ContactRowView key={c.id} c={c} onDeleted={() => setRows((rs) => rs.filter((r) => r.id !== c.id))} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ContactRowView({
  c,
  reason,
  onDeleted,
}: {
  c: ContactRow;
  reason?: string;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-secondary/20">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-foreground">{c.name}</p>
          {c.source && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter",
                SOURCE_STYLE[c.source] ?? "bg-secondary text-muted-foreground",
              )}
            >
              {c.source}
            </span>
          )}
        </div>
        <p className="truncate text-xs font-medium text-muted-foreground">
          {c.title ?? c.notes ?? "—"}
        </p>
        {reason && (
          <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-400">
            <Sparkles size={11} className="mt-0.5 shrink-0" />
            {reason}
          </p>
        )}
        {c.companyName && (
          <Link
            href={`/companies/${c.companyId}`}
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            <Building2 size={11} />
            {c.companyName}
          </Link>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {c.email && (
          <a href={`mailto:${c.email}`} title={c.email} className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors">
            <Mail size={14} />
          </a>
        )}
        {c.linkedin && (
          <a href={c.linkedin} target="_blank" rel="noreferrer" title="LinkedIn" className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors">
            <ExternalLink size={14} />
          </a>
        )}
        {c.twitter && (
          <a href={c.twitter} target="_blank" rel="noreferrer" title="X / Twitter" className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors">
            <AtSign size={14} />
          </a>
        )}
        <button
          type="button"
          disabled={pending}
          title="Remove contact"
          onClick={() =>
            startTransition(async () => {
              const res = await deleteContactAction(c.id);
              if (res.ok) onDeleted();
            })
          }
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}
