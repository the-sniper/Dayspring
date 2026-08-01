"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCheck,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  ThumbsUp,
  X,
} from "lucide-react";
import {
  promotePostAction,
  setPostStatusAction,
} from "@/lib/actions/linkedin-posts";
import CompanyLogo from "@/components/company-logo";
import Tip from "@/components/tip";
import { cn } from "@/lib/utils";

export type PostView = {
  id: string;
  postUrl: string;
  authorName: string;
  authorHeadline: string | null;
  authorProfileUrl: string | null;
  text: string;
  postedAt: string | null;
  reactions: number | null;
  companyName: string | null;
  roleTitles: string[];
  location: string | null;
  jobUrl: string | null;
  status: string;
  jobId: string | null;
};

// Posts are long-form, so the body is clamped until asked for. CLAMP_CHARS is
// roughly four lines at card width — enough to judge relevance.
const CLAMP_CHARS = 320;

// Recency is the whole point of this source — a role posted 40 minutes ago is a
// different opportunity from one posted this morning — so the card shows both a
// scannable age and the actual clock time. Returns plain strings only: never an
// object (interpolating one into JSX/`${…}` shows as "[object Object]").
function formatPosted(
  iso: string | null,
): { label: string; absolute: string } | null {
  if (!iso || typeof iso !== "string") return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const mins = Math.floor((Date.now() - then.getTime()) / 60_000);

  const relative =
    mins < 1
      ? "just now"
      : mins < 60
        ? `${mins}m ago`
        : mins < 1440
          ? `${Math.floor(mins / 60)}h ago`
          : mins < 10_080
            ? `${Math.floor(mins / 1440)}d ago`
            : mins < 43_200
              ? `${Math.floor(mins / 10_080)}w ago`
              : `${Math.floor(mins / 43_200)}mo ago`;

  const absolute = then.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(then.getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" as const }
      : {}),
  });
  return { label: `${relative} · ${absolute}`, absolute };
}

// Actors pass through whatever the profile had, which is sometimes filler like
// "--". Treat a headline with no letters or digits as absent.
function cleanHeadline(headline: string | null): string | null {
  return headline && /[\p{L}\p{N}]/u.test(headline) ? headline : null;
}

export default function LinkedinPostCard({
  post,
  showTriage = true,
}: {
  post: PostView;
  // Hide Done / Ignore on archive tabs (done / ignored).
  showTriage?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotedJobId, setPromotedJobId] = useState<string | null>(post.jobId);
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  const roleTitles = post.roleTitles ?? [];
  // The extractor can't always name the company or role from post prose. Rather
  // than writing a junk job row, the card asks for the two fields it needs.
  const needsDetails = !post.companyName || roleTitles.length === 0;
  const [showForm, setShowForm] = useState(false);
  const [companyName, setCompanyName] = useState(post.companyName ?? "");
  const [title, setTitle] = useState(roleTitles[0] ?? "");

  const long = (post.text ?? "").length > CLAMP_CHARS;
  const body = expanded || !long ? post.text : `${post.text.slice(0, CLAMP_CHARS)}…`;
  const posted = formatPosted(post.postedAt);
  const headline = cleanHeadline(post.authorHeadline);
  const isDone = post.status === "done";

  function promote(overrides?: { companyName: string; title: string }) {
    setError(null);
    startTransition(async () => {
      const res = await promotePostAction(post.id, overrides);
      if (res.ok) {
        setPromotedJobId(res.jobId);
        setShowForm(false);
      } else setError(res.error);
    });
  }

  function setStatus(to: "done" | "ignored" | "new") {
    setError(null);
    startTransition(async () => {
      const res = await setPostStatusAction(post.id, to);
      if (res.ok) setDismissed(true);
      else setError(res.error ?? "Couldn't update that post.");
    });
  }

  if (dismissed) return null;

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-brand-300 dark:hover:border-brand-800">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogo
            name={post.companyName ?? post.authorName}
            className="h-9 w-9 shrink-0 text-xs"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {post.authorProfileUrl ? (
                <a
                  href={post.authorProfileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand-600 hover:underline"
                >
                  {post.authorName}
                </a>
              ) : (
                post.authorName
              )}
            </p>
            <p className="truncate text-[11px] font-medium text-muted-foreground">
              {headline ?? "LinkedIn post"}
              {posted ? (
                <>
                  {" · "}
                  {/* Formatted from the viewer's clock and locale, so the SSR
                      pass can legitimately differ from the client. */}
                  <time
                    dateTime={post.postedAt!}
                    title={posted.absolute}
                    className="font-semibold text-foreground/70"
                    suppressHydrationWarning
                  >
                    {posted.label}
                  </time>
                </>
              ) : null}
              {post.reactions !== null && post.reactions > 0 && (
                <>
                  {" · "}
                  <ThumbsUp size={9} className="inline align-baseline" />{" "}
                  {post.reactions.toLocaleString()}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {promotedJobId ? (
            <Link
              href={`/jobs/${promotedJobId}`}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400"
            >
              <Check size={12} strokeWidth={3} />
              In pipeline
              <ArrowUpRight size={12} />
            </Link>
          ) : (
            <Tip label="Add to your pipeline as a wishlist role" placement="left">
              <button
                type="button"
                disabled={pending}
                onClick={() => (needsDetails ? setShowForm((s) => !s) : promote())}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 text-[11px] font-bold text-white shadow-sm shadow-brand-500/25 transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-40"
              >
                {pending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={13} strokeWidth={3} />
                )}
                Add
              </button>
            </Tip>
          )}
          {showTriage && (
            <>
              <Tip label="Mark done — move to Done tab; won't return on later searches" placement="left">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus("done")}
                  aria-label="Mark this post done"
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[11px] font-bold text-foreground transition-all hover:border-emerald-500 hover:text-emerald-600 active:scale-95 disabled:opacity-40"
                >
                  {pending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CheckCheck size={13} strokeWidth={2.5} />
                  )}
                  Done
                </button>
              </Tip>
              <Tip label="Ignore this post" placement="left">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus("ignored")}
                  aria-label="Ignore this post"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-all hover:border-destructive hover:text-destructive active:scale-95 disabled:opacity-40"
                >
                  <X size={15} strokeWidth={3} />
                </button>
              </Tip>
            </>
          )}
          {isDone && (
            <Tip label="Move back to the untriaged feed" placement="left">
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus("new")}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[11px] font-bold text-muted-foreground transition-all hover:text-foreground active:scale-95 disabled:opacity-40"
              >
                {pending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RotateCcw size={12} />
                )}
                Restore
              </button>
            </Tip>
          )}
        </div>
      </header>

      {(post.companyName || roleTitles.length > 0 || post.location) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {roleTitles.map((t) => (
            <span
              key={t}
              className="rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
            >
              {t}
            </span>
          ))}
          {post.companyName && (
            <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              {post.companyName}
            </span>
          )}
          {post.location && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <MapPin size={10} />
              {post.location}
            </span>
          )}
        </div>
      )}

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[11px] font-bold text-brand-600 hover:underline dark:text-brand-400"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <a
          href={post.postUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-muted"
        >
          <ExternalLink size={12} />
          View post
        </a>
        {post.jobUrl ? (
          <a
            href={post.jobUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-50/50 px-2.5 py-1.5 text-[11px] font-bold text-brand-700 transition-colors hover:bg-brand-100 dark:bg-brand-950/20 dark:text-brand-300"
          >
            <ArrowUpRight size={12} />
            Job link
          </a>
        ) : (
          <span className="text-[11px] font-medium text-muted-foreground/70">
            No job link in this post — apply through the author.
          </span>
        )}
      </footer>

      {showForm && !promotedJobId && (
        <div className="mt-3 rounded-xl border border-border bg-secondary/30 p-3">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">
            The post didn&apos;t clearly name these — confirm before it joins
            your pipeline.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company"
              aria-label="Company"
              className="min-w-[140px] flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Role title"
              aria-label="Role title"
              className="min-w-[140px] flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="button"
              disabled={pending || !companyName.trim() || !title.trim()}
              onClick={() => promote({ companyName, title })}
              className={cn(
                "flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-all active:scale-95 disabled:opacity-40",
              )}
            >
              {pending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} strokeWidth={3} />
              )}
              Save
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-destructive">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </article>
  );
}
