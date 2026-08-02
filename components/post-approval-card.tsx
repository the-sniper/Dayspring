"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, X } from "lucide-react";
import {
  approvePostAction,
  markPostedAction,
  rejectPostAction,
  type OrchestraActionResult,
} from "@/lib/actions/orchestra";
import { cn } from "@/lib/utils";

export type QueuedPost = {
  id: string;
  platform: string;
  angle: string;
  text: string;
  status: string;
  citations: { title: string; url: string }[];
};

export default function PostApprovalCard({ post }: { post: QueuedPost }) {
  const [text, setText] = useState(post.text);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<OrchestraActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isX = post.platform === "x";
  const overLimit = isX && text.length > 280;
  const inReview = post.status === "queued_for_review";

  function act(fn: () => Promise<OrchestraActionResult>) {
    setResult(null);
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      router.refresh();
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            isX
              ? "bg-stone-500/10 text-stone-600 dark:text-stone-300"
              : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
          )}
        >
          {isX ? "X / Twitter" : "LinkedIn"}
        </span>
        {isX && (
          <span
            className={cn(
              "text-[11px] font-semibold",
              overLimit ? "text-rose-500" : "text-muted-foreground",
            )}
          >
            {text.length}/280
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
          {post.angle}
        </span>
      </div>

      {inReview ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={isX ? 4 : 8}
          className="mt-3 w-full resize-y rounded-xl border border-border bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground focus:border-brand-500/50 focus:outline-none"
        />
      ) : (
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-secondary/40 p-3 font-mono text-[13px] leading-relaxed text-foreground">
          {text}
        </pre>
      )}

      {post.citations.length > 0 && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground">
          Sources:{" "}
          {post.citations.slice(0, 3).map((c, i) => (
            <a
              key={c.url}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:underline dark:text-brand-400"
            >
              {i > 0 ? " · " : ""}
              {c.url.replace(/^https?:\/\//, "").slice(0, 40)}
            </a>
          ))}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {inReview && !rejecting && (
          <>
            <button
              type="button"
              disabled={pending || overLimit}
              onClick={() => act(() => approvePostAction(post.id, text))}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
              Approve{text !== post.text ? " (edited)" : ""}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setRejecting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted"
            >
              <X size={13} strokeWidth={3} /> Reject
            </button>
          </>
        )}
        {inReview && rejecting && (
          <div className="flex w-full flex-wrap items-center gap-2">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why? (this teaches the team — be specific)"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:border-rose-500/50 focus:outline-none"
            />
            <button
              type="button"
              disabled={pending || reason.trim().length < 5}
              onClick={() => act(() => rejectPostAction(post.id, reason.trim()))}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : "Confirm reject"}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              cancel
            </button>
          </div>
        )}
        {post.status === "approved" && (
          <>
            <button
              type="button"
              onClick={() => void copy()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105"
            >
              {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy post"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => markPostedAction(post.id))}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted"
            >
              Mark posted
            </button>
          </>
        )}
      </div>
      {result && !result.ok && (
        <p className="mt-2 text-[11px] font-semibold text-rose-500">
          {result.message}
        </p>
      )}
    </div>
  );
}
