"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, RotateCcw, X } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  decideDraftAction,
  reviseDraftAction,
} from "@/lib/actions/campaign";
import { cn } from "@/lib/utils";

// Checkpoint 3. Three moves per draft, exactly as the reference pipeline
// defines them: approve (with your edits), revise (say what's wrong, the
// editor fixes only that), skip (with a reason that becomes a lesson).
//
// Approving files the post into the same /company queue the daily run uses —
// one queue, one copy button, one place a post can be marked as shipped.

type Draft = Doc<"orchCampaigns">["drafts"][number];

function WordCount({ text, platform }: { text: string; platform: string }) {
  if (platform === "x") {
    const n = text.length;
    return (
      <span className={cn("text-[11px] font-semibold", n > 280 ? "text-rose-500" : "text-muted-foreground")}>
        {n}/280 characters
      </span>
    );
  }
  const n = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <span className={cn("text-[11px] font-semibold", n > 300 ? "text-rose-500" : "text-muted-foreground")}>
      {n} words
    </span>
  );
}

function DraftCard({
  campaignId,
  draft,
}: {
  campaignId: string;
  draft: Draft;
}) {
  const [text, setText] = useState(draft.text);
  // The textarea is local state so typing is instant, but a revision rewrites
  // the draft server-side — and local state does NOT re-initialise on new
  // props. Without this, "Revise" appeared to do nothing: the editor's rewrite
  // landed in Convex while the card kept showing the old text. Adjusting state
  // during render (React's documented pattern) makes the server's version win
  // whenever it actually changes.
  const [serverText, setServerText] = useState(draft.text);
  if (draft.text !== serverText) {
    setServerText(draft.text);
    setText(draft.text);
  }
  const [mode, setMode] = useState<"idle" | "revising" | "skipping">("idle");
  const [instruction, setInstruction] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const decided = !!draft.decision;
  const edited = text.trim() !== draft.aiText.trim();

  function act(fn: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message);
      else setMode("idle");
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm transition-opacity",
        decided ? "border-border/50 opacity-60" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold text-foreground">
          {draft.title}
        </p>
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
          {draft.pillar}
        </span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {draft.hookType}
        </span>
        {draft.decision && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              draft.decision === "approved"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-stone-500/10 text-stone-500",
            )}
          >
            {draft.decision}
          </span>
        )}
      </div>

      {draft.verdict !== "confirmed" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/[0.07] p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="min-w-0 text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
            <span className="font-bold uppercase tracking-wider">
              Verifier: {draft.verdict}
            </span>
            {draft.issues.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {draft.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {decided ? (
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-secondary/40 p-3.5 font-mono text-[13px] leading-relaxed text-foreground">
          {draft.text}
        </pre>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={draft.platform === "x" ? 5 : 12}
          className="mt-3 w-full resize-y rounded-xl border border-border bg-background p-3.5 font-mono text-[13px] leading-relaxed text-foreground focus:border-brand-500/50 focus:outline-none"
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <WordCount text={decided ? draft.text : text} platform={draft.platform} />
        {draft.revisions > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {draft.revisions} revision{draft.revisions === 1 ? "" : "s"}
          </span>
        )}
        {edited && !decided && (
          <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
            your edits
          </span>
        )}
        {draft.citations.length > 0 && (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            Sources:{" "}
            {draft.citations.slice(0, 2).map((c, i) => (
              <a
                key={c.url}
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 hover:underline dark:text-brand-400"
              >
                {i > 0 ? " · " : ""}
                {c.url.replace(/^https?:\/\//, "").slice(0, 34)}
              </a>
            ))}
          </span>
        )}
      </div>

      {draft.edits.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground">
            What the editor changed ({draft.edits.length})
          </summary>
          <ul className="mt-1.5 list-disc pl-5 text-[12px] text-muted-foreground">
            {draft.edits.map((e, i) => (
              <li key={`${e}-${i}`}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      {!decided && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {mode === "idle" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  act(() =>
                    decideDraftAction(campaignId, draft.topicId, "approved", text),
                  )
                }
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
                Approve{edited ? " (edited)" : ""}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setMode("revising")}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted"
              >
                <RotateCcw size={13} /> Revise
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setMode("skipping")}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted"
              >
                <X size={13} /> Skip
              </button>
            </>
          )}

          {mode === "revising" && (
            <div className="flex w-full flex-col gap-2">
              <input
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="What should change? (e.g. cut the last paragraph, make the CTA a real question)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-brand-500/50 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending || instruction.trim().length < 4}
                  onClick={() =>
                    act(async () => {
                      const r = await reviseDraftAction(
                        campaignId,
                        draft.topicId,
                        instruction,
                      );
                      if (r.ok) setInstruction("");
                      return r;
                    })
                  }
                  className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105 disabled:opacity-50"
                >
                  {pending ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={13} className="animate-spin" /> Revising…
                    </span>
                  ) : (
                    "Send to the editor"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("idle")}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  cancel
                </button>
              </div>
            </div>
          )}

          {mode === "skipping" && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why? (optional, but this is how the team learns your taste)"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-rose-500/50 focus:outline-none"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  act(() =>
                    decideDraftAction(
                      campaignId,
                      draft.topicId,
                      "skipped",
                      undefined,
                      reason,
                    ),
                  )
                }
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : "Confirm skip"}
              </button>
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                cancel
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] font-semibold text-rose-500">{error}</p>}
    </div>
  );
}

export default function CampaignDraftReview({
  campaign,
}: {
  campaign: Doc<"orchCampaigns">;
}) {
  const pendingCount = campaign.drafts.filter((d) => !d.decision).length;
  const notes = campaign.notes ?? [];
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
          Approve, revise, or skip
        </h2>
        <p className="text-sm text-muted-foreground">
          {campaign.drafts.length} draft{campaign.drafts.length === 1 ? "" : "s"} ·{" "}
          {pendingCount} still waiting on you. Edit in place before approving —
          your edits are kept and measured.
        </p>
      </div>

      {/* Anything the stage lost or skipped. Silence here would read as "this
          is everything", which is exactly the wrong impression. */}
      {notes.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
            <AlertTriangle size={13} /> Not everything made it
          </p>
          <ul className="mt-1.5 list-disc pl-5 text-[12px] leading-relaxed text-foreground/80">
            {notes.map((n, i) => (
              <li key={`${n}-${i}`}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {campaign.drafts.map((d) => (
          <DraftCard key={d.topicId} campaignId={campaign._id} draft={d} />
        ))}
      </div>
    </section>
  );
}
