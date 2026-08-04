"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, BookmarkPlus, Check, Loader2 } from "lucide-react";
import {
  addWritingSampleAction,
  recordMetricsAction,
} from "@/lib/actions/campaign";
import { cn } from "@/lib/utils";

// The other half of the loop. An agent can't see LinkedIn, so performance
// arrives the only honest way: you type it in. Everything Pulse later says
// about "what works" traces back to these rows — which is exactly why it says
// "insufficient data" when they're empty instead of inventing an audience.

export type PerfPost = {
  id: string;
  platform: string;
  status: string;
  pillar: string | null;
  hookType: string | null;
  topicTitle: string | null;
  angle: string;
  text: string;
  postedAt: string;
  metrics: {
    impressions?: number;
    reactions?: number;
    comments?: number;
    reposts?: number;
    note?: string;
    capturedAt: string;
  } | null;
};

function num(v: string): number | undefined {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function MetricsRow({ post }: { post: PerfPost }) {
  const [open, setOpen] = useState(false);
  const [impressions, setImpressions] = useState(
    post.metrics?.impressions?.toString() ?? "",
  );
  const [reactions, setReactions] = useState(
    post.metrics?.reactions?.toString() ?? "",
  );
  const [comments, setComments] = useState(
    post.metrics?.comments?.toString() ?? "",
  );
  const [reposts, setReposts] = useState(post.metrics?.reposts?.toString() ?? "");
  const [note, setNote] = useState(post.metrics?.note ?? "");
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const r = await recordMetricsAction(post.id, {
        ...(num(impressions) === undefined ? {} : { impressions: num(impressions) }),
        ...(num(reactions) === undefined ? {} : { reactions: num(reactions) }),
        ...(num(comments) === undefined ? {} : { comments: num(comments) }),
        ...(num(reposts) === undefined ? {} : { reposts: num(reposts) }),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });
  }

  function keep() {
    startTransition(async () => {
      const perf = [
        num(impressions) ? `${impressions} impressions` : "",
        num(reactions) ? `${reactions} reactions` : "",
        num(comments) ? `${comments} comments` : "",
      ]
        .filter(Boolean)
        .join(", ");
      const r = await addWritingSampleAction({
        text: post.text,
        ...(perf ? { performance: perf } : {}),
        ...(why.trim() ? { why: why.trim() } : {}),
      });
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });
  }

  const hasMetrics = !!post.metrics;

  return (
    <li className="rounded-xl border border-border/70 bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-2.5 px-3.5 py-3 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {post.topicTitle ?? post.angle}
        </span>
        {post.pillar && (
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            {post.pillar}
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            post.status === "posted"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          )}
        >
          {post.status === "posted" ? "posted" : "approved — not logged"}
        </span>
        {hasMetrics && (
          <span className="font-mono text-[11px] font-bold text-muted-foreground">
            {post.metrics?.impressions ?? "?"} impr ·{" "}
            {post.metrics?.reactions ?? "?"} react ·{" "}
            {post.metrics?.comments ?? "?"} comm
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 px-3.5 py-3">
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 font-mono text-[12px] leading-relaxed text-foreground">
            {post.text}
          </pre>
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
              onClick={save}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105 disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
              {post.status === "posted" ? "Update numbers" : "Log & mark posted"}
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
            <BarChart3 size={18} className="text-brand-500" /> Performance
          </h2>
          <p className="text-sm text-muted-foreground">
            {posts.length} shipped · {logged} with numbers. What you log here is
            the only evidence the strategy review is allowed to reason from.
          </p>
        </div>
      </div>
      {posts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing shipped yet. Approve a draft, post it, then log what it did.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {posts.map((p) => (
            <MetricsRow key={p.id} post={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
