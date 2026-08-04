"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { createCampaignAction } from "@/lib/actions/campaign";
import { startCampaignStage } from "@/lib/studio/kick";
import { PLATFORM_IDS, PLATFORMS } from "@/shared/platforms";
import { cn } from "@/lib/utils";

// Step 0: what this campaign is for, how long it runs, and where it runs.
// The objective is the field that does the most work downstream — the scout
// filters candidates against it and the planner shapes the week around it.

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const PRESETS: { label: string; days: number; posts: number }[] = [
  { label: "This week", days: 6, posts: 4 },
  { label: "Two weeks", days: 13, posts: 8 },
  { label: "A month", days: 29, posts: 12 },
];

export default function CampaignLauncher({
  pillars,
  today,
}: {
  pillars: string[];
  today: string;
}) {
  const [title, setTitle] = useState(`Campaign from ${today}`);
  const [objective, setObjective] = useState("");
  const [seedIdeas, setSeedIdeas] = useState("");
  const [focus, setFocus] = useState("");
  const [startDate, setStartDate] = useState(addDays(today, 1));
  const [endDate, setEndDate] = useState(addDays(today, 7));
  const [targetPosts, setTargetPosts] = useState(4);
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function togglePlatform(p: string) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  function preset(days: number, posts: number) {
    setStartDate(addDays(today, 1));
    setEndDate(addDays(today, days + 1));
    setTargetPosts(posts);
  }

  function launch() {
    setError(null);
    startTransition(async () => {
      const r = await createCampaignAction({
        title,
        objective,
        seedIdeas,
        focus,
        startDate,
        endDate,
        targetPosts,
        platforms,
      });
      if (!r.ok || !r.campaignId) {
        setError(r.message);
        return;
      }
      await startCampaignStage(r.campaignId);
      router.push(`/company/studio?c=${r.campaignId}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-foreground">
          <Sparkles size={18} className="text-brand-500" /> New campaign
        </h2>
        <p className="text-sm text-muted-foreground">
          Set the objective and the dates. The team scouts, plans a schedule
          across your platforms, writes, and edits — you decide three times.
        </p>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Campaign name
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-brand-500/50 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Objective
          </span>
          <input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="e.g. get in front of eng leaders hiring agent engineers"
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-brand-500/50 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Topics you already want covered
          </span>
          <textarea
            value={seedIdeas}
            onChange={(e) => setSeedIdeas(e.target.value)}
            rows={3}
            placeholder={"One per line — kept verbatim, ranked, never dropped.\nLeave blank and the team suggests everything itself."}
            className="resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-brand-500/50 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Platforms
          </span>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_IDS.map((p) => {
              const on = platforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={cn(
                    "rounded-xl border px-3.5 py-2 text-xs font-bold transition-all",
                    on
                      ? "border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {PLATFORMS[p].label}
                </button>
              );
            })}
          </div>
          <span className="text-[11px] text-muted-foreground">
            A topic can run on several — the team writes a different treatment
            for each, never the same post three times.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Runs from → to
          </span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-brand-500/50 focus:outline-none"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-brand-500/50 focus:outline-none"
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => preset(p.days, p.posts)}
                className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Posts across the whole range
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={targetPosts}
            onChange={(e) => setTargetPosts(Number(e.target.value))}
            className="w-24 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-brand-500/50 focus:outline-none"
          />
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder={pillars.length ? `Focus (default: ${pillars.join(" · ")})` : "Focus (optional)"}
            className="mt-1 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-brand-500/50 focus:outline-none"
          />
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
              <Sparkles size={16} /> Scout &amp; plan this campaign
            </>
          )}
        </button>
        {error && <p className="text-[12px] font-semibold text-rose-500">{error}</p>}
      </div>
    </div>
  );
}
