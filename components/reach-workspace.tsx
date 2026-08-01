"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  analyzeJobReachAction,
  draftReachMessagesAction,
  saveReachContactAction,
  type ReachAnalyzeResult,
  type ReachContactResult,
} from "@/lib/actions/reach";
import PersonAvatar from "@/components/person-avatar";
import {
  REACH_CHANNEL_HINTS,
  REACH_CHANNEL_LABELS,
  REACH_CHANNELS,
  REACH_CONTACT_ROLE_LABELS,
  type ReachChannel,
} from "@/shared/reach";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ReachWorkspace({
  hasApiKey,
  hasApolloKey,
  hasProfile,
}: {
  hasApiKey: boolean;
  hasApolloKey: boolean;
  hasProfile: boolean;
}) {
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [result, setResult] = useState<ReachAnalyzeResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [drafting, startDraftTransition] = useTransition();
  const [activeContact, setActiveContact] = useState(0);
  const [channel, setChannel] = useState<ReachChannel>("cold_dm");
  const [copied, setCopied] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const ready = hasApiKey && hasApolloKey && hasProfile;

  function run() {
    startTransition(async () => {
      setResult(null);
      setSaveMsg(null);
      setDraftError(null);
      setActiveContact(0);
      setChannel("cold_dm");
      const res = await analyzeJobReachAction({
        url,
        pastedDescription: paste,
      });
      setResult(res);
    });
  }

  const ok = result?.ok ? result : null;
  const contact: ReachContactResult | null =
    ok && ok.contacts.length > 0
      ? (ok.contacts[Math.min(activeContact, ok.contacts.length - 1)] ?? null)
      : null;
  const draft = contact?.messages?.[channel] ?? null;

  function patchActiveContact(
    patch: Partial<Pick<ReachContactResult, "personAngle" | "messages">>,
  ) {
    setResult((prev) => {
      if (!prev?.ok) return prev;
      const contacts = prev.contacts.map((c, i) =>
        i === activeContact ? { ...c, ...patch } : c,
      );
      return { ...prev, contacts };
    });
  }

  function writeMessages() {
    if (!ok || !contact) return;
    startDraftTransition(async () => {
      setDraftError(null);
      const res = await draftReachMessagesAction({
        job: {
          title: ok.job.title,
          companyName: ok.job.companyName,
          location: ok.job.location,
          description: ok.job.description,
        },
        contact: {
          name: contact.name,
          title: contact.title,
          role: contact.role,
          warmth: contact.warmth,
          warmReason: contact.warmReason,
          affiliations: contact.affiliations,
        },
      });
      if (!res.ok) {
        setDraftError(res.error);
        return;
      }
      patchActiveContact({
        personAngle: res.personAngle,
        messages: res.messages,
      });
    });
  }

  async function copyText(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  function saveContact(c: ReachContactResult) {
    if (!ok?.job.companyId) return;
    startTransition(async () => {
      setSaveMsg(null);
      const res = await saveReachContactAction({
        companyId: ok.job.companyId!,
        person: {
          apolloId: c.apolloId,
          name: c.name,
          title: c.title,
          linkedinUrl: c.linkedinUrl,
          photoUrl: c.photoUrl,
        },
      });
      setSaveMsg(res.ok ? `Saved ${c.name}` : res.error);
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Link2
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://boards.greenhouse.io/… or any public job link"
              className="w-full rounded-xl border border-border bg-secondary/30 py-3 pl-10 pr-4 text-sm transition-all placeholder:text-muted-foreground/50 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && ready && !pending) run();
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPaste ? "Hide pasted description" : "Or paste the job description"}
            </button>
            <button
              type="button"
              disabled={!ready || pending || (!url.trim() && !paste.trim())}
              onClick={run}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Researching team…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Find hiring team
                </>
              )}
            </button>
          </div>

          {showPaste && (
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={8}
              placeholder="Paste the full job description here — useful when the link is behind login or JavaScript-only (LinkedIn jobs)."
              className="w-full rounded-xl border border-border bg-secondary/30 p-3 text-sm transition-all placeholder:text-muted-foreground/50 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          )}

          {!ready && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>
                {!hasProfile
                  ? "Paste your resume in Settings → Profile first so messages can be personalized."
                  : !hasApiKey || !hasApolloKey
                    ? "Add your Anthropic (or OpenAI) and Apollo API keys in Settings → API Keys."
                    : "Missing setup."}
              </p>
            </div>
          )}
        </div>
      </section>

      {result && !result.ok && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{result.error}</p>
        </div>
      )}

      {ok && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Job
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                  {ok.job.title}
                </h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {ok.job.companyName}
                  {ok.job.location ? ` · ${ok.job.location}` : ""}
                  {ok.job.companyDomain ? ` · ${ok.job.companyDomain}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ok.job.url && (
                  <a
                    href={ok.job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Open posting <ExternalLink size={12} />
                  </a>
                )}
                {ok.job.jobId && (
                  <Link
                    href={`/jobs/${ok.job.jobId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300"
                  >
                    View in pipeline
                  </Link>
                )}
              </div>
            </div>
            {ok.searchTitles.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Searched titles:{" "}
                <span className="font-medium text-foreground/80">
                  {ok.searchTitles.join(", ")}
                </span>
              </p>
            )}
            {ok.warnings.length > 0 && (
              <ul className="mt-3 space-y-1">
                {ok.warnings.map((w) => (
                  <li
                    key={w}
                    className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200"
                  >
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ok.contacts.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                No hiring-team contacts found for this company yet.
              </p>
            </section>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <aside className="space-y-2 lg:col-span-4">
                <p className="px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Hiring team · {ok.contacts.length}
                </p>
                {ok.contacts.map((c, i) => (
                  <button
                    key={`${c.apolloId ?? c.name}-${i}`}
                    type="button"
                    onClick={() => {
                      setActiveContact(i);
                      setChannel(c.warmth === "warm" ? "warm_dm" : "cold_dm");
                      setDraftError(null);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                      i === activeContact
                        ? "border-brand-500/40 bg-brand-500/10"
                        : "border-border bg-card hover:bg-secondary/40",
                    )}
                  >
                    <PersonAvatar
                      name={c.name}
                      photoUrl={c.photoUrl}
                      className="h-10 w-10 text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            c.warmth === "warm"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-secondary text-muted-foreground",
                          )}
                        >
                          {c.warmth}
                        </span>
                        {c.messages && (
                          <span className="shrink-0 text-[10px] font-medium text-brand-700 dark:text-brand-300">
                            drafted
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.title ?? "Title unknown"}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-foreground/70">
                        {REACH_CONTACT_ROLE_LABELS[c.role]}
                      </p>
                    </div>
                  </button>
                ))}
              </aside>

              <section className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-8">
                {contact && (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-xl font-semibold tracking-tight">
                          {contact.name}
                        </h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {contact.title ?? "Title unknown"}
                          {contact.location ? ` · ${contact.location}` : ""}
                        </p>
                        {contact.personAngle && (
                          <p className="mt-2 text-sm text-foreground/80">
                            {contact.personAngle}
                          </p>
                        )}
                        {contact.warmReason && (
                          <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            {contact.warmReason}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {contact.linkedinUrl && (
                          <a
                            href={contact.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-secondary/50"
                          >
                            LinkedIn <ExternalLink size={12} />
                          </a>
                        )}
                        {!contact.savedContactId && ok.job.companyId && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => saveContact(contact)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-secondary/50 disabled:opacity-50"
                          >
                            <UserPlus size={12} /> Save contact
                          </button>
                        )}
                      </div>
                    </div>

                    {saveMsg && (
                      <p className="mt-3 text-xs font-medium text-muted-foreground">
                        {saveMsg}
                      </p>
                    )}

                    <div className="mt-6 flex flex-wrap gap-1.5 border-b border-border pb-3">
                      {REACH_CHANNELS.map((ch) => {
                        const Icon =
                          ch === "email"
                            ? Mail
                            : ch === "linkedin"
                              ? MessageSquare
                              : Sparkles;
                        return (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => setChannel(ch)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                              channel === ch
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                            )}
                          >
                            <Icon size={13} />
                            {REACH_CHANNEL_LABELS[ch]}
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                      {REACH_CHANNEL_HINTS[channel]}
                    </p>

                    {!contact.messages ? (
                      <div className="mt-6 rounded-xl border border-dashed border-border bg-secondary/15 px-5 py-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          Messages are written on demand so you only spend tokens
                          on people you actually reach out to.
                        </p>
                        <button
                          type="button"
                          disabled={drafting || !hasApiKey}
                          onClick={writeMessages}
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
                        >
                          {drafting ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Writing messages…
                            </>
                          ) : (
                            <>
                              <Sparkles size={16} />
                              Write message with AI
                            </>
                          )}
                        </button>
                        {draftError && (
                          <p className="mt-3 text-xs font-medium text-destructive">
                            {draftError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {draft?.subject && (
                          <div className="rounded-xl border border-border bg-secondary/20 px-4 py-3">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Subject
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  void copyText("subject", draft.subject!)
                                }
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                              >
                                {copied === "subject" ? (
                                  <Check size={12} />
                                ) : (
                                  <Copy size={12} />
                                )}
                                Copy
                              </button>
                            </div>
                            <p className="text-sm font-medium">{draft.subject}</p>
                          </div>
                        )}
                        {draft && (
                          <div className="rounded-xl border border-border bg-secondary/20 px-4 py-3">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Message
                                {channel === "cold_dm" && (
                                  <span className="ml-2 font-medium normal-case tracking-normal text-muted-foreground/80">
                                    {draft.body.length}/300
                                  </span>
                                )}
                              </span>
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void copyText("body", draft.body)
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                                >
                                  {copied === "body" ? (
                                    <Check size={12} />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                  Copy
                                </button>
                                {channel === "email" && draft.subject && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void copyText(
                                        "both",
                                        `Subject: ${draft.subject}\n\n${draft.body}`,
                                      )
                                    }
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                                  >
                                    {copied === "both" ? (
                                      <Check size={12} />
                                    ) : (
                                      <Copy size={12} />
                                    )}
                                    Copy all
                                  </button>
                                )}
                              </div>
                            </div>
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                              {draft.body}
                            </pre>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] text-muted-foreground">
                            Scaffolding only — rewrite in your voice before sending.
                            LinkedIn sends stay manual (copy → paste).
                          </p>
                          <button
                            type="button"
                            disabled={drafting}
                            onClick={writeMessages}
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                          >
                            {drafting ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Sparkles size={12} />
                            )}
                            Rewrite with AI
                          </button>
                        </div>
                        {draftError && (
                          <p className="text-xs font-medium text-destructive">
                            {draftError}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
