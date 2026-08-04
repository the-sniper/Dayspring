"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookmarkPlus,
  Check,
  Copy,
  History,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import {
  addWritingSampleAction,
  recordMetricsAction,
  restorePostVersionAction,
  updatePostAction,
} from "@/lib/actions/campaign";
import { countLabel, overLimit, platformSpec } from "@/shared/platforms";
import { cn } from "@/lib/utils";

// The queue and the analytics loop in one place: an approved post can still be
// edited (each save banks a version), and logging its numbers is what marks it
// shipped — which is also what clears the version history.

export type PerfPost = {
  id: string;
  platform: string;
  status: string;
  pillar: string | null;
  hookType: string | null;
  topicTitle: string | null;
  angle: string;
  title: string | null;
  channel: string | null;
  text: string;
  scheduledFor: string | null;
  postedAt: string;
  image: {
    prompt: string;
    altText: string;
    aspect: string;
    rationale: string;
    ready: boolean;
  } | null;
  history: { text: string; title: string | null; at: string; by: string }[];
  metrics: {
    impressions?: number;
    reactions?: number;
    comments?: number;
    reposts?: number;
    note?: string;
    capturedAt: string;
  } | null;
};

const PLATFORM_STYLE: Record<string, string> = {
  linkedin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  x: "bg-stone-500/10 text-stone-600 dark:text-stone-300",
  reddit: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

function num(v: string): number | undefined {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PostRow({ post }: { post: PerfPost }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(post.text);
  const [title, setTitle] = useState(post.title ?? "");
  const [serverText, setServerText] = useState(post.text);
  if (post.text !== serverText) {
    setServerText(post.text);
    setText(post.text);
    setTitle(post.title ?? "");
  }
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [impressions, setImpressions] = useState(post.metrics?.impressions?.toString() ?? "");
  const [reactions, setReactions] = useState(post.metrics?.reactions?.toString() ?? "");
  const [comments, setComments] = useState(post.metrics?.comments?.toString() ?? "");
  const [reposts, setReposts] = useState(post.metrics?.reposts?.toString() ?? "");
  const [note, setNote] = useState(post.metrics?.note ?? "");
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const spec = platformSpec(post.platform);
  const shipped = post.status === "posted";
  const dirty = text !== post.text || title !== (post.title ?? "");
  const tooLong = overLimit(post.platform, text);

  function act(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });
  }

  function keep() {
    const perf = [
      num(impressions) ? `${impressions} impressions` : "",
      num(reactions) ? `${reactions} reactions` : "",
      num(comments) ? `${comments} comments` : "",
    ]
      .filter(Boolean)
      .join(", ");
    act(() =>
      addWritingSampleAction({
        text: post.text,
        ...(perf ? { performance: perf } : {}),
        ...(why.trim() ? { why: why.trim() } : {}),
      }),
    );
  }

  return (
    <li className="rounded-xl border border-border/70 bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-2.5 px-3.5 py-3 text-left"
      >
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            PLATFORM_STYLE[post.platform] ?? PLATFORM_STYLE.linkedin,
          )}
        >
          {spec.short}
        </span>
        {post.scheduledFor && !shipped && (
          <span className="text-[11px] font-bold text-muted-foreground">
            {post.scheduledFor}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {post.title || post.topicTitle || post.angle}
        </span>
        {post.channel && (
          <span className="text-[11px] font-semibold text-muted-foreground">
            {post.channel}
          </span>
        )}
        {post.history.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
            <History size={10} /> {post.history.length}
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            shipped
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          )}
        >
          {shipped ? "posted" : "ready to post"}
        </span>
        {post.metrics && (
          <span className="font-mono text-[11px] font-bold text-muted-foreground">
            {post.metrics.impressions ?? "?"} impr · {post.metrics.reactions ?? "?"} react ·{" "}
            {post.metrics.comments ?? "?"} comm
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 px-3.5 py-3">
          {spec.needsTitle && !shipped && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title"
              className="mb-2 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-semibold text-foreground focus:border-brand-500/50 focus:outline-none"
            />
          )}
          {shipped ? (
            <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 font-mono text-[12px] leading-relaxed text-foreground">
              {post.text}
            </pre>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={post.platform === "x" ? 4 : 9}
              className={cn(
                "w-full resize-y rounded-lg border bg-card p-3 font-mono text-[12px] leading-relaxed text-foreground focus:outline-none",
                tooLong ? "border-rose-500/50" : "border-border focus:border-brand-500/50",
              )}
            />
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "text-[11px] font-semibold",
                tooLong ? "text-rose-500" : "text-muted-foreground",
              )}
            >
              {countLabel(post.platform, shipped ? post.text : text)}
            </span>
            {post.history.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((s) => !s)}
                className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <History size={12} /> {post.history.length} earlier version
                {post.history.length === 1 ? "" : "s"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(
                  spec.needsTitle && title ? `${title}\n\n${text}` : text,
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105"
            >
              {copied ? <Check size={11} strokeWidth={3} /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy post"}
            </button>
          </div>

          {showHistory && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Version history — cleared when you log the numbers below
              </p>
              {post.history.map((h, i) => (
                <details key={`${h.at}-${i}`} className="rounded-lg bg-background/60 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-foreground">
                    {when(h.at)} · {h.by}
                  </summary>
                  <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {h.text}
                  </pre>
                  {!shipped && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => restorePostVersionAction(post.id, i))}
                      className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted"
                    >
                      <RotateCcw size={11} /> Restore this version
                    </button>
                  )}
                </details>
              ))}
            </div>
          )}

          {post.image && (
            <div className="mt-2 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">
                <ImageIcon size={11} /> Image brief · {post.image.aspect}
                {post.image.ready && (
                  <span className="text-emerald-600 dark:text-emerald-400">· ready</span>
                )}
              </p>
              <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">
                {post.image.prompt}
              </pre>
            </div>
          )}

          {!shipped && (
            <button
              type="button"
              disabled={pending || !dirty || tooLong}
              onClick={() => act(() => updatePostAction(post.id, text, title))}
              className="mt-2 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save edit
            </button>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Impressions", impressions, setImpressions],
              ["Reactions", reactions, setReactions],
              ["Comments", comments, setComments],
              ["Reposts", reposts, setReposts],
            ].map(([label, value, set]) => (
              <label key={label as string} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {label as string}
                </span>
                <input
                  inputMode="numeric"
                  value={value as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                  className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-brand-500/50 focus:outline-none"
                />
              </label>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything notable? (who commented, where it got shared)"
            className="mt-2 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-brand-500/50 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                act(() =>
                  recordMetricsAction(post.id, {
                    ...(num(impressions) === undefined ? {} : { impressions: num(impressions) }),
                    ...(num(reactions) === undefined ? {} : { reactions: num(reactions) }),
                    ...(num(comments) === undefined ? {} : { comments: num(comments) }),
                    ...(num(reposts) === undefined ? {} : { reposts: num(reposts) }),
                    ...(note.trim() ? { note: note.trim() } : {}),
                  }),
                )
              }
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105 disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
              {shipped ? "Update numbers" : "Log & mark posted"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={keep}
              title="Add this post to your voice samples — future drafts calibrate to it"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <BookmarkPlus size={13} /> This sounded like me
            </button>
            <input
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="why it worked (optional)"
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:border-brand-500/50 focus:outline-none"
            />
          </div>
          {!shipped && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Logging the numbers marks it posted and clears its version
              history.
            </p>
          )}
          {msg && (
            <p
              className={cn(
                "mt-2 text-[11px] font-semibold",
                msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500",
              )}
            >
              {msg.text}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function PostPerformancePanel({ posts }: { posts: PerfPost[] }) {
  const logged = posts.filter((p) => p.metrics).length;
  return (
    <section className="rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-foreground">
            <BarChart3 size={18} className="text-brand-500" /> Posts &amp;
            performance
          </h2>
          <p className="text-sm text-muted-foreground">
            {posts.length} approved or shipped · {logged} with numbers. What you
            log here is the only evidence the strategy review may reason from.
          </p>
        </div>
      </div>
      {posts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing approved yet. Approve a draft, post it on its day, then log
          what it did.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {posts.map((p) => (
            <PostRow key={p.id} post={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
