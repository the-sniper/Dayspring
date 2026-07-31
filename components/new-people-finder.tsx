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
  Building2,
  MapPin,
} from "lucide-react";
import {
  findNewPeopleAction,
  saveColdContactAction,
  type FindPeopleResult,
} from "@/lib/actions/contacts";
import type { ApolloPerson } from "@/lib/integrations/apollo/search";
import PersonAvatar from "@/components/person-avatar";
import { cn } from "@/lib/utils";
import { keyMessages } from "@/lib/keys/messages";

// Cold-contact discovery over Apollo's whole people database — NEW people not
// yet in your network, matched to a plain-English query. Distinct from the warm
// "who do I know?" filter above (that's only your saved/imported contacts).
export default function NewPeopleFinder({
  hasApolloKey,
  hasApiKey,
  seedQuery,
}: {
  hasApolloKey: boolean;
  hasApiKey: boolean;
  seedQuery?: string;
}) {
  const [text, setText] = useState(seedQuery ?? "");
  const [result, setResult] = useState<FindPeopleResult | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = hasApolloKey && hasApiKey;

  function run() {
    if (!text.trim()) return;
    startTransition(async () => setResult(await findNewPeopleAction(text)));
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium text-muted-foreground leading-relaxed">
        Describe who you want to meet and Apollo searches its people database for{" "}
        <span className="font-bold text-foreground">new</span> matches — cold
        contacts to reach out to. Browsing is credit-free; revealing an email is
        the separate paid step.
      </p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ready && run()}
            placeholder='e.g. "recruiters in Philadelphia hiring fullstack devs"'
            className="w-full rounded-xl border border-border bg-secondary/30 pl-10 pr-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50"
          />
          <Sparkles
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
          />
        </div>
        <button
          type="button"
          disabled={pending || !ready || !text.trim()}
          onClick={run}
          title={
            ready
              ? "Search Apollo for new people"
              : keyMessages.needsApolloAnthropicShort
          }
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
        >
          {pending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Search size={16} strokeWidth={3} />
          )}
          Find people
        </button>
      </div>

      {!ready && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <AlertCircle size={12} />
          {!hasApolloKey && !hasApiKey
            ? keyMessages.apolloAndAnthropic
            : !hasApolloKey
              ? keyMessages.apollo
              : keyMessages.anthropic}
        </p>
      )}

      {result && !result.ok && (
        <p className="flex items-start gap-2 text-xs font-medium text-destructive">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {result.error}
        </p>
      )}

      {result?.ok && (
        <>
          <p className="text-xs font-medium text-muted-foreground">
            <Sparkles size={12} className="inline -mt-0.5 mr-1 text-brand-500" />
            {result.interpretation}
            {result.totalEntries > result.people.length &&
              ` · ${result.totalEntries.toLocaleString()} total, showing top ${result.people.length}`}
          </p>
          <div className="rounded-xl border border-border bg-secondary/10 overflow-hidden">
            {result.people.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs font-medium text-muted-foreground">
                No one matched. Try a broader role or drop the location.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {result.people.map((p) => (
                  <div
                    key={p.apolloId}
                    className="flex items-start justify-between gap-4 p-4 transition-colors hover:bg-secondary/20"
                  >
                    <PersonAvatar
                      name={p.name}
                      photoUrl={p.photoUrl}
                      className="h-10 w-10 text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground truncate">
                        {p.name}
                      </p>
                      {p.title && (
                        <p className="text-xs font-medium text-muted-foreground truncate">
                          {p.title}
                        </p>
                      )}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {p.company && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-foreground/80">
                            <Building2 size={11} />
                            {p.company}
                          </span>
                        )}
                        {p.location && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                            <MapPin size={11} />
                            {p.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {p.linkedinUrl && (
                        <a
                          href={p.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="LinkedIn"
                          className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors cursor-pointer"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <SaveButton person={p} alreadySaved={p.saved} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SaveButton({
  person,
  alreadySaved,
}: {
  person: ApolloPerson;
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
          const res = await saveColdContactAction(person);
          if (res.ok) setSaved(true);
        })
      }
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-95 cursor-pointer disabled:cursor-default",
        saved
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "bg-primary text-primary-foreground shadow-sm hover:scale-110",
      )}
      title={saved ? "Saved to contacts" : "Save to contacts"}
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
