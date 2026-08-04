"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { createCampaignAction } from "@/lib/actions/campaign";
import { startCampaignStage } from "@/lib/studio/kick";
import { cn } from "@/lib/utils";

// Step 0 of the pipeline: what's on your mind this week. Everything here is
// optional except the count — a blank form is a valid "you find the topics".

export default function CampaignLauncher({
  pillars,
  defaultTitle,
}: {
  pillars: string[];
  defaultTitle: string;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [seedIdeas, setSeedIdeas] = useState("");
  const [focus, setFocus] = useState("");
  const [targetPosts, setTargetPosts] = useState(4);
  const [platform, setPlatform] = useState("linkedin");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function launch() {
    setError(null);
    startTransition(async () => {
      const r = await createCampaignAction({
        title,
        seedIdeas,
        focus,
        targetPosts,
        platform,
      });
      if (!r.ok || !r.campaignId) {
        setError(r.message);
        return;
      }
      // The campaign row exists in "researching"; this starts the engine.
      await startCampaignStage(r.campaignId);
      router.refresh();
    });
  }

  return (
    <div className="rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-foreground">
          <Sparkles size={18} className="text-brand-500" /> Start a campaign
        </h2>
        <p className="text-sm text-muted-foreground">
          The team scouts topics, you pick. It writes hooks, you pick. It drafts
          and edits, you approve. Nothing posts without you.
        </p>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Campaign name
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-brand-500/50 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            What's on your mind this week?
          </span>
          <textarea
            value={seedIdeas}
            onChange={(e) => setSeedIdeas(e.target.value)}
            rows={4}
            placeholder={"One idea per line — your words are kept verbatim.\nLeave blank and the team finds everything itself."}
            className="resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-brand-500/50 focus:outline-none"
          />
          <span className="text-[11px] text-muted-foreground">
            Your ideas always make the shortlist — they get ranked, never
            dropped.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Focus (optional)
          </span>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder={pillars.length ? pillars.join(" · ") : "e.g. agents, hiring"}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-brand-500/50 focus:outline-none"
          />
          <span className="text-[11px] text-muted-foreground">
            Defaults to your pillars.
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Posts &amp; platform
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={8}
              value={targetPosts}
              onChange={(e) => setTargetPosts(Number(e.target.value))}
              className="w-20 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-brand-500/50 focus:outline-none"
            />
            <div className="flex overflow-hidden rounded-xl border border-border">
              {(["linkedin", "x"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={cn(
                    "px-3.5 py-2.5 text-xs font-bold transition-colors",
                    platform === p
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {p === "x" ? "X" : "LinkedIn"}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground">
            The team scouts about twice as many topics as you ask for.
          </span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={launch}
          disabled={pending}
          className="flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-[var(--accent-foreground)] shadow-sm transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Starting…
            </>
          ) : (
            <>
              <Sparkles size={16} /> Scout this week's topics
            </>
          )}
        </button>
        {error && (
          <p className="text-[12px] font-semibold text-rose-500">{error}</p>
        )}
      </div>
    </div>
  );
}
