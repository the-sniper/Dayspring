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
} from "lucide-react";
import {
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

// Free, instant search over your saved + imported contacts. This is the
// primary "who do I know" — no Happenstance credits, works on your 540
// LinkedIn imports immediately.
export default function ContactSearch({
  initial,
  total,
}: {
  initial: ContactRow[];
  total: number;
}) {
  const [rows, setRows] = useState<ContactRow[]>(initial);
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();

  function run(query: string) {
    startTransition(async () => {
      setRows(await searchLocalContactsAction(query));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              run(e.target.value);
            }}
            placeholder="Search your contacts — name, title, or company…"
            className="w-full rounded-xl border border-border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50"
          />
          {pending ? (
            <Loader2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground/50" />
          ) : (
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          )}
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground">
        {q ? `${rows.length} match${rows.length === 1 ? "" : "es"}` : `${total} contacts`}
        {!q && total > rows.length && ` · showing ${rows.length} most recent — search to find any`}
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {q ? "No contacts match that search." : "No contacts yet — import your LinkedIn connections."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-secondary/10 overflow-hidden">
          {rows.map((c) => (
            <ContactRowView key={c.id} c={c} onDeleted={() => setRows((rs) => rs.filter((r) => r.id !== c.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactRowView({ c, onDeleted }: { c: ContactRow; onDeleted: () => void }) {
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
          <a
            href={`mailto:${c.email}`}
            title={c.email}
            className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors"
          >
            <Mail size={14} />
          </a>
        )}
        {c.linkedin && (
          <a
            href={c.linkedin}
            target="_blank"
            rel="noreferrer"
            title="LinkedIn"
            className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors"
          >
            <ExternalLink size={14} />
          </a>
        )}
        {c.twitter && (
          <a
            href={c.twitter}
            target="_blank"
            rel="noreferrer"
            title="X / Twitter"
            className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors"
          >
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
