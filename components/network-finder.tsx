"use client";

import { useState, useTransition } from "react";
import {
  Sparkles,
  Search,
  UserPlus,
  Loader2,
  Check,
  AlertCircle,
  ExternalLink,
  AtSign,
  Users,
} from "lucide-react";
import {
  saveNetworkContactAction,
  searchNetworkAction,
  type NetworkSearchResult,
} from "@/lib/actions/happenstance";
import type { HappenstancePerson } from "@/lib/integrations/happenstance/search";
import { keyMessages } from "@/lib/keys/messages";
import { cn } from "@/lib/utils";

// Warm-network search over YOUR OWN connections (Happenstance). Distinct from
// the Apollo cold-contact finder: these are people you already know.
export default function NetworkFinder({
  companyId,
  hasKey,
  seedQuery,
}: {
  companyId: string | null;
  hasKey: boolean;
  seedQuery?: string;
}) {
  const [text, setText] = useState(seedQuery ?? "");
  const [result, setResult] = useState<NetworkSearchResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => setResult(await searchNetworkAction(text)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Users size={16} className="text-brand-500" />
          Warm network
        </h3>
        {result?.ok && result.balance !== null && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {result.balance} credits left
          </span>
        )}
        {!hasKey && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-destructive">
            <AlertCircle size={12} />
            Missing Key
          </span>
        )}
      </div>
      <p className="text-xs font-medium text-muted-foreground leading-relaxed">
        People you already know — searched over your own connected accounts.
        Costs 2 Happenstance credits per search.
      </p>

      {!hasKey && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <AlertCircle size={12} />
          {keyMessages.happenstance}
        </p>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && hasKey && run()}
            placeholder="who do I know that works in ML at a startup?"
            className="w-full rounded-xl border border-border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50"
          />
          <Sparkles
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
          />
        </div>
        <button
          type="button"
          disabled={pending || !hasKey}
          onClick={run}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
        >
          {pending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Search size={16} strokeWidth={3} />
          )}
          Search (2cr)
        </button>
      </div>

      {result && !result.ok && (
        <p className="flex items-center gap-2 text-xs font-medium text-destructive">
          <AlertCircle size={14} />
          {result.error}
        </p>
      )}

      {result?.ok && (
        <div className="rounded-xl border border-border bg-secondary/10 overflow-hidden">
          {result.people.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs font-medium text-muted-foreground">
              No one in your network matched. Try a broader description.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {result.people.map((p) => (
                <div
                  key={p.happenstanceId}
                  className="flex items-start justify-between gap-4 p-4 transition-colors hover:bg-secondary/20"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">
                      {p.name}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground truncate">
                      {[p.title, p.company].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {p.summary && (
                      <p className="mt-1 text-xs text-muted-foreground/80 line-clamp-2">
                        {p.summary}
                      </p>
                    )}
                    {p.mutuals.length > 0 && (
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">
                        via {p.mutuals.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.linkedin && (
                      <a
                        href={p.linkedin}
                        target="_blank"
                        rel="noreferrer"
                        title="LinkedIn"
                        className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors cursor-pointer"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {p.twitter && (
                      <a
                        href={p.twitter}
                        target="_blank"
                        rel="noreferrer"
                        title="X / Twitter"
                        className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors cursor-pointer"
                      >
                        <AtSign size={14} />
                      </a>
                    )}
                    <SaveButton
                      companyId={companyId}
                      person={p}
                      alreadySaved={p.saved}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SaveButton({
  companyId,
  person,
  alreadySaved,
}: {
  companyId: string | null;
  person: HappenstancePerson;
  alreadySaved: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(alreadySaved);
  return (
    <button
      type="button"
      disabled={pending || saved}
      onClick={() =>
        startTransition(async () => {
          const res = await saveNetworkContactAction(companyId, person);
          if (res.ok) setSaved(true);
        })
      }
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-95 cursor-pointer",
        saved
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "bg-primary text-primary-foreground shadow-sm hover:scale-110",
      )}
      title={saved ? "Saved" : "Save to contacts"}
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
