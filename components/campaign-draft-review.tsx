"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Copy,
  History,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  decideDraftAction,
  finishCampaignAction,
  moveScheduleAction,
  reviseDraftAction,
  saveDraftEditAction,
  setImageReadyAction,
} from "@/lib/actions/campaign";
import { countLabel, overLimit, platformSpec } from "@/shared/platforms";
import { cn } from "@/lib/utils";

// Checkpoint 3. Four moves per draft: save your own edit (banked to history),
// revise (say what's wrong, the editor fixes only that), approve, or skip with
// a reason. Approving files the post into the queue on its scheduled day.

type Draft = Doc<"orchCampaigns">["drafts"][number];

const PLATFORM_STYLE: Record<string, string> = {
  linkedin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  x: "bg-stone-500/10 text-stone-600 dark:text-stone-300",
  reddit: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ImageBrief({
  campaignId,
  slotId,
  image,
}: {
  campaignId: string;
  slotId: string;
  image: NonNullable<Draft["image"]>;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-secondary/20 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">
          <ImageIcon size={12} /> Image brief · {image.aspect}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {image.rationale}
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(image.prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105"
        >
          {copied ? <Check size={11} strokeWidth={3} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </div>
      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-background/70 p-2.5 font-mono text-[12px] leading-relaxed text-foreground">
        {image.prompt}
      </pre>
      <p className="mt-2 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">Alt text: </span>
        {image.altText}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setImageReadyAction(campaignId, slotId, !image.ready);
            router.refresh();
          })
        }
        className={cn(
          "mt-2.5 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors",
          image.ready
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-border text-muted-foreground hover:bg-muted",
        )}
      >
        {pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={3} />}
        {image.ready ? "Image generated & attached" : "Mark image ready"}
      </button>
    </div>
  );
}

function DraftCard({ campaignId, draft }: { campaignId: string; draft: Draft }) {
  const slotId = draft.slotId ?? draft.topicId;
  const spec = platformSpec(draft.platform);
  const [text, setText] = useState(draft.text);
  const [postTitle, setPostTitle] = useState(draft.postTitle ?? "");
  // Local state does NOT re-initialise on new props, so a revision landing
  // server-side would otherwise leave the card showing the old text.
  const [serverText, setServerText] = useState(draft.text);
  if (draft.text !== serverText) {
    setServerText(draft.text);
    setText(draft.text);
    setPostTitle(draft.postTitle ?? "");
  }
  const [mode, setMode] = useState<"idle" | "revising" | "skipping">("idle");
  const [showHistory, setShowHistory] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const decided = !!draft.decision;
  const dirty = text !== draft.text || postTitle !== (draft.postTitle ?? "");
  const edited = text.trim() !== draft.aiText.trim();
  const history = draft.history ?? [];
  const tooLong = overLimit(draft.platform, text);

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
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            PLATFORM_STYLE[draft.platform] ?? PLATFORM_STYLE.linkedin,
          )}
        >
          {spec.label}
        </span>
        {draft.channel && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {draft.channel}
          </span>
        )}
        <p className="min-w-0 flex-1 truncate font-semibold text-foreground">
          {draft.title}
        </p>
        {decided ? (
          draft.scheduledFor && (
            <span className="text-[11px] font-bold text-muted-foreground">
              {draft.scheduledFor}
            </span>
          )
        ) : (
          <input
            type="date"
            value={draft.scheduledFor ?? ""}
            onChange={(e) =>
              act(() => moveScheduleAction(campaignId, slotId, e.target.value))
            }
            title="Move this post to another day"
            className="rounded-lg border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-foreground focus:border-brand-500/50 focus:outline-none"
          />
        )}
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
          {draft.pillar}
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
            {draft.revisions > 0 && (
              <span className="ml-1.5 font-medium opacity-80">
                (from the original audit — not re-run after your{" "}
                {draft.revisions} revision{draft.revisions === 1 ? "" : "s"})
              </span>
            )}
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

      {spec.needsTitle && (
        <div className="mt-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Post title
          </label>
          {decided ? (
            <p className="mt-1 font-semibold text-foreground">{draft.postTitle}</p>
          ) : (
            <input
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              placeholder="The title carries the post on Reddit"
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground focus:border-brand-500/50 focus:outline-none"
            />
          )}
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
          className={cn(
            "mt-3 w-full resize-y rounded-xl border bg-background p-3.5 font-mono text-[13px] leading-relaxed text-foreground focus:outline-none",
            tooLong ? "border-rose-500/50" : "border-border focus:border-brand-500/50",
          )}
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "text-[11px] font-semibold",
            tooLong ? "text-rose-500" : "text-muted-foreground",
          )}
        >
          {countLabel(draft.platform, decided ? draft.text : text)}
        </span>
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
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <History size={12} /> {history.length} earlier version
            {history.length === 1 ? "" : "s"}
          </button>
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

      {showHistory && history.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Version history — oldest first, last {history.length} of 10 kept.
            Cleared when the post ships.
          </p>
          {history.map((h, i) => (
            <details key={`${h.at}-${i}`} className="rounded-lg bg-background/60 p-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-foreground">
                {when(h.at)} · {h.by} ·{" "}
                {h.text.trim().split(/\s+/).filter(Boolean).length} words
              </summary>
              {h.title && (
                <p className="mt-1.5 text-[12px] font-semibold text-foreground">{h.title}</p>
              )}
              <pre className="mt-1.5 max-h-52 overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-muted-foreground">
                {h.text}
              </pre>
              {!decided && (
                <button
                  type="button"
                  onClick={() => {
                    setText(h.text);
                    if (h.title !== undefined) setPostTitle(h.title);
                    setShowHistory(false);
                  }}
                  className="mt-2 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted"
                >
                  Load this version into the editor
                </button>
              )}
            </details>
          ))}
        </div>
      )}

      {draft.image && !decided && (
        <ImageBrief campaignId={campaignId} slotId={slotId} image={draft.image} />
      )}

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
                disabled={pending || !dirty}
                onClick={() =>
                  act(() =>
                    saveDraftEditAction(campaignId, slotId, text, postTitle),
                  )
                }
                title="Bank this version — you can walk it back from history"
                className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save edit
              </button>
              <button
                type="button"
                disabled={pending || tooLong}
                onClick={() =>
                  act(() =>
                    decideDraftAction(campaignId, slotId, "approved", text, postTitle),
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
              {tooLong && (
                <span className="text-[11px] font-semibold text-rose-500">
                  Over the {spec.label} limit — trim before approving.
                </span>
              )}
            </>
          )}

          {mode === "revising" && (
            <div className="flex w-full flex-col gap-2">
              <input
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="What should change? (e.g. cut the last paragraph, drop the unsourced stat)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-brand-500/50 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending || instruction.trim().length < 4}
                  onClick={() =>
                    act(async () => {
                      const r = await reviseDraftAction(campaignId, slotId, instruction);
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
                      slotId,
                      "skipped",
                      undefined,
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
  const sorted = [...campaign.drafts].sort(
    (a, b) =>
      (a.scheduledFor ?? "9").localeCompare(b.scheduledFor ?? "9") ||
      a.platform.localeCompare(b.platform),
  );
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
          Approve, revise, or skip
        </h2>
        <p className="text-sm text-muted-foreground">
          {campaign.drafts.length} draft{campaign.drafts.length === 1 ? "" : "s"} ·{" "}
          {pendingCount} still waiting on you. Edit in place — &ldquo;Save
          edit&rdquo; banks a version you can walk back.
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
        {sorted.map((d) => (
          <DraftCard
            key={d.slotId ?? d.topicId}
            campaignId={campaign._id}
            draft={d}
          />
        ))}
      </div>

      {pendingCount === 0 && campaign.stage !== "complete" && (
        <CloseCampaign campaignId={campaign._id} />
      )}
    </section>
  );
}

function CloseCampaign({ campaignId }: { campaignId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        Every draft has a decision. Approved posts are in the queue below and on
        the calendar, waiting for their day.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await finishCampaignAction(campaignId);
            router.refresh();
          })
        }
        className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-foreground)] transition-all hover:brightness-105 disabled:opacity-50"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
        Close campaign
      </button>
    </div>
  );
}
