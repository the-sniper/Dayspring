"use client";

import { useState, useTransition } from "react";
import {
  deleteContactAction,
  enrichContactAction,
  saveContactAction,
  searchApolloAction,
  type ApolloSearchResult,
} from "@/lib/actions/contacts";
import type { ApolloPerson } from "@/lib/integrations/apollo/search";
import { 
  Search, 
  UserPlus, 
  Mail, 
  Trash2, 
  Loader2, 
  Check,
  AlertCircle,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

type SavedContact = {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
  linkedin: string | null;
  emailStatus: string | null;
  outreachStatus: string;
};

export default function ContactFinder({
  companyId,
  defaultTitles,
  savedContacts,
  hasApolloKey,
  domainSet,
}: {
  companyId: number;
  defaultTitles: string[];
  savedContacts: SavedContact[];
  hasApolloKey: boolean;
  domainSet: boolean;
}) {
  const [titles, setTitles] = useState(defaultTitles.join(", "));
  const [result, setResult] = useState<ApolloSearchResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = !hasApolloKey || !domainSet;

  function search(page = 1) {
    startTransition(async () => {
      setMessage(null);
      setResult(
        await searchApolloAction(
          companyId,
          titles.split(",").map((t) => t.trim()),
          page,
        ),
      );
    });
  }

  return (
    <div className="space-y-8">
      {/* Search — Apollo people search is credit-free */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Find contacts (Apollo)</h3>
          {!hasApolloKey && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-destructive">
              <AlertCircle size={12} />
              Missing Apollo Key
            </span>
          )}
          {hasApolloKey && !domainSet && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-destructive">
              <AlertCircle size={12} />
              Set domain first
            </span>
          )}
        </div>
        
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              placeholder="technical recruiter, engineering manager…"
              className="w-full rounded-xl border border-border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50"
            />
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          </div>
          <button
            type="button"
            disabled={pending || disabled}
            onClick={() => search(1)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
          >
            {pending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} strokeWidth={3} />
            )}
            Search
          </button>
        </div>

        {result && !result.ok && (
          <p className="text-xs font-medium text-destructive">{result.error}</p>
        )}

        {result?.ok && (
          <div className="rounded-xl border border-border bg-secondary/10 overflow-hidden">
            <div className="bg-secondary/30 px-4 py-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {result.totalEntries} matches
                {result.totalPages > 1 && ` · page ${result.page}/${result.totalPages}`}
              </p>
            </div>
            <div className="divide-y divide-border">
              {result.people.map((p) => (
                <div key={p.apolloId} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-secondary/20">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                    <p className="text-xs font-medium text-muted-foreground truncate">{p.title ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.linkedinUrl && (
                      <a
                        href={p.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="View LinkedIn"
                        className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors cursor-pointer"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {p.saved ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                        <Check size={16} strokeWidth={3} />
                      </div>
                    ) : (
                      <SaveButton companyId={companyId} person={p} />
                    )}
                  </div>
                </div>
              ))}
            </div>
            {result.totalPages > result.page && (
              <button
                type="button"
                disabled={pending}
                onClick={() => search(result.page + 1)}
                className="w-full py-3 text-xs font-bold uppercase tracking-widest text-brand-600 hover:bg-brand-50/50 dark:text-brand-400 dark:hover:bg-brand-950/20 transition-colors cursor-pointer"
              >
                Load Next Page
              </button>
            )}
          </div>
        )}
      </div>

      {/* Saved contacts */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-foreground">
          Saved contacts ({savedContacts.length})
        </h3>
        {message && <p className="text-xs font-medium text-destructive">{message}</p>}
        
        {savedContacts.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              None yet — search above and save the people worth a warm intro.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {savedContacts.map((c) => (
              <div key={c.id} className="group relative rounded-xl border border-border bg-secondary/20 p-4 transition-all hover:border-brand-500/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">{c.name}</p>
                    <p className="text-xs font-medium text-muted-foreground truncate">{c.title ?? "No title"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        const res = await deleteContactAction(c.id);
                        setMessage(res.ok ? null : res.error);
                      })
                    }
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    title="Remove contact"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {c.linkedin && (
                      <a
                        href={c.linkedin}
                        target="_blank"
                        rel="noreferrer"
                        title="View LinkedIn"
                        className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors cursor-pointer"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {c.outreachStatus !== "none" && (
                      <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                        {c.outreachStatus}
                      </span>
                    )}
                  </div>
                  
                  {c.email ? (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
                      <Mail size={12} />
                      <span className="font-mono">{c.email}</span>
                    </div>
                  ) : c.emailStatus === "unavailable" ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">No email found</span>
                  ) : (
                    <EnrichButton
                      contactId={c.id}
                      onError={(e) => setMessage(e)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SaveButton({
  companyId,
  person,
}: {
  companyId: number;
  person: ApolloPerson;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <button
      type="button"
      disabled={pending || saved}
      onClick={() =>
        startTransition(async () => {
          const res = await saveContactAction(companyId, person);
          if (res.ok) setSaved(true);
        })
      }
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-95 cursor-pointer",
        saved 
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "bg-primary text-primary-foreground shadow-sm hover:scale-110"
      )}
      title={saved ? "Saved" : "Save contact"}
    >
      {pending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : saved ? (
        <Check size={16} strokeWidth={3} />
      ) : (
        <UserPlus size={16} strokeWidth={2.5} />
      )}
    </button>
  );
}

function EnrichButton({
  contactId,
  onError,
}: {
  contactId: number;
  onError: (e: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title="Consumes 1 Apollo credit"
      onClick={() =>
        startTransition(async () => {
          const res = await enrichContactAction(contactId);
          if (!res.ok) onError(res.error);
        })
      }
      className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-brand-600/20 hover:bg-brand-700 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
    >
      {pending ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Mail size={12} strokeWidth={3} />
      )}
      {pending ? "Revealing…" : "Reveal Email"}
    </button>
  );
}
