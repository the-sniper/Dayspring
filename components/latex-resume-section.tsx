"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  FileCode2,
  HelpCircle,
  Loader2,
  MinusCircle,
  Wrench,
} from "lucide-react";
import { generateLatexResumeAction } from "@/lib/actions/latex-resume";
import type { LengthMode, TailoredLatexType } from "@/lib/claude/latex-resume";
import { cn } from "@/lib/utils";

// The hiring-manager view of a tailored resume: what it scored, what it
// couldn't cover, and whether it actually hit the page target.
//
// The gap list is the part worth reading. "in_kb_not_on_resume" means the
// knowledge base had the evidence and this rewrite pulled it in — those are
// wins. "missing" is a real hole, and "flagged" is something the knowledge base
// marked unverified, deliberately left out for you to decide on.

type GapStatus = TailoredLatexType["gaps"][number]["status"];

const GAP_META: Record<
  GapStatus,
  { label: string; icon: typeof CheckCircle2; className: string; order: number }
> = {
  missing: {
    label: "Real gap",
    icon: MinusCircle,
    className: "text-destructive",
    order: 0,
  },
  flagged: {
    label: "Needs your call",
    icon: AlertTriangle,
    className: "text-amber-600 dark:text-amber-400",
    order: 1,
  },
  partial: {
    label: "Thin",
    icon: CircleDashed,
    className: "text-amber-600/80 dark:text-amber-400/80",
    order: 2,
  },
  in_kb_not_on_resume: {
    label: "Pulled from KB",
    icon: Wrench,
    className: "text-brand-600 dark:text-brand-400",
    order: 3,
  },
  present: {
    label: "Covered",
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
    order: 4,
  },
};

function scoreTone(pct: number): string {
  if (pct >= 0.85) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 0.65) return "text-brand-600 dark:text-brand-400";
  if (pct >= 0.45) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function ScoreBar({
  label,
  points,
  max,
  why,
}: {
  label: string;
  points: number;
  max: number;
  why: string;
}) {
  const pct = max > 0 ? points / max : 0;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className={cn("ml-auto text-xs font-bold tabular-nums", scoreTone(pct))}>
          {points}/{max}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 0.85
              ? "bg-emerald-500"
              : pct >= 0.65
                ? "bg-brand-500"
                : pct >= 0.45
                  ? "bg-amber-500"
                  : "bg-destructive",
          )}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{why}</p>
    </div>
  );
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LatexResumeSection({
  jobId,
  companyName,
  jobTitle,
  defaultLengthMode,
  ready,
  hasEngine,
}: {
  jobId: string;
  companyName: string;
  jobTitle: string;
  defaultLengthMode: LengthMode;
  ready: boolean;
  hasEngine: boolean;
}) {
  const [mode, setMode] = useState<LengthMode>(defaultLengthMode);
  const [res, setRes] = useState<{
    result: TailoredLatexType;
    pages: number | null;
    compileError: string | null;
    attempts: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTex, setShowTex] = useState(false);
  const [pending, start] = useTransition();

  const target = mode === "one_page" ? 1 : 2;
  const gaps = res
    ? [...res.result.gaps].sort((a, b) => GAP_META[a.status].order - GAP_META[b.status].order)
    : [];
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <FileCode2 size={18} className="text-brand-500" />
        <h2 className="text-lg font-bold text-foreground">Tailored resume (LaTeX)</h2>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {(["one_page", "two_page"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  mode === m
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "one_page" ? "1 page" : "2 pages"}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={pending || !ready}
            onClick={() =>
              start(async () => {
                setError(null);
                setRes(null);
                const r = await generateLatexResumeAction(jobId, mode);
                if (r.ok) {
                  setRes({
                    result: r.result,
                    pages: r.pages,
                    compileError: r.compileError,
                    attempts: r.attempts,
                  });
                } else {
                  setError(r.error);
                }
              })
            }
            className="rounded-[var(--radius)] bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-[var(--accent-foreground)] shadow-sm shadow-brand-500/20 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" />
                Tailoring… (~1–2 min)
              </span>
            ) : res ? (
              "Regenerate"
            ) : (
              "Tailor resume"
            )}
          </button>
        </div>
      </div>

      {!ready && (
        <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          Add your .tex template and Master Knowledge Base in Settings → Resume
          sources first. Both are required — the template supplies the typography,
          the knowledge base supplies the facts.
        </p>
      )}
      {ready && !res && !pending && !error && (
        <p className="mt-3 text-sm font-medium leading-relaxed text-muted-foreground">
          {hasEngine ? (
            <>
              Rewrites your .tex against this JD from the knowledge base, compiles
              it, and checks the real page count — retrying once if it missed{" "}
              {mode === "one_page" ? "one page" : "two pages"}. Reports a
              screener&apos;s score and an honest gap list. Never invents anything.
            </>
          ) : (
            /* Don't promise the page check when it can't run — that's the one
               part of this that needs a compiler, and claiming it anyway makes
               the output look like it passed a check it never got. */
            <>
              Rewrites your .tex against this JD from the knowledge base and
              reports a screener&apos;s score and an honest gap list. Never invents
              anything. PDF rendering isn&apos;t available here, so you&apos;ll get
              the .tex to download and the {mode === "one_page" ? "one-page" : "two-page"}{" "}
              target won&apos;t be verified against a real page count.
            </>
          )}
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-destructive">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {res && (
        <div className="mt-5 space-y-5">
          {/* Headline: score, length outcome, downloads. */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/40 p-4">
            <div>
              <div
                className={cn(
                  "text-3xl font-bold tabular-nums leading-none",
                  scoreTone(res.result.score.total / 100),
                )}
              >
                {res.result.score.total}
                <span className="text-base font-medium text-muted-foreground">/100</span>
              </div>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Match score
              </p>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium",
                  res.pages === null
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : res.pages === target
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                )}
              >
                {res.pages === null
                  ? "not compiled"
                  : res.pages === target
                    ? `fills ${target} page${target === 1 ? "" : "s"} ✓`
                    : `${res.pages} page${res.pages === 1 ? "" : "s"} — target ${target}`}
              </span>
              {res.attempts > 1 && (
                <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  repaired once
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  download(
                    `${slug(companyName)}-${slug(jobTitle)}.tex`,
                    res.result.latex,
                    "application/x-tex",
                  )
                }
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
              >
                <Download size={12} />
                .tex
              </button>
              <button
                type="button"
                onClick={() => setShowTex((v) => !v)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
              >
                {showTex ? "Hide source" : "View source"}
              </button>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-foreground">{res.result.tailoring_note}</p>

          {res.compileError && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>
                {hasEngine ? "The LaTeX didn't compile: " : ""}
                {res.compileError}
              </span>
            </p>
          )}

          {/* Rubric. */}
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Score breakdown
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreBar label="Keyword & skills match" {...res.result.score.keyword_match} />
              <ScoreBar
                label="Experience & impact"
                {...res.result.score.experience_and_impact}
              />
              <ScoreBar label="ATS formatting" {...res.result.score.ats_formatting} />
              <ScoreBar label="Readability" {...res.result.score.readability} />
              <ScoreBar label="Tailoring to this role" {...res.result.score.tailoring} />
            </div>
          </div>

          {res.result.top_blockers.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Holding the score down
              </h3>
              <ul className="space-y-1.5">
                {res.result.top_blockers.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-0.5 text-brand-500">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {gaps.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                JD requirements ({gaps.length})
              </h3>
              <ul className="space-y-2">
                {gaps.map((g, i) => {
                  const meta = GAP_META[g.status];
                  const Icon = meta.icon;
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <Icon size={14} className={cn("mt-0.5 shrink-0", meta.className)} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {g.requirement}{" "}
                          <span className={cn("text-[11px] font-bold", meta.className)}>
                            {meta.label}
                          </span>
                        </p>
                        <p className="text-xs leading-snug text-muted-foreground">{g.note}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {res.result.open_questions.length > 0 && (
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <HelpCircle size={12} />
                Needs an answer from you
              </h3>
              {/* These are the places it refused to guess. Answering one and
                  adding it to the knowledge base makes every future tailoring
                  better, not just this one. */}
              <ul className="space-y-1.5">
                {res.result.open_questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-0.5 text-muted-foreground">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Add the answers to your Master Knowledge Base in Settings so the
                next tailoring already has them.
              </p>
            </div>
          )}

          {showTex && (
            <pre className="max-h-[28rem] overflow-auto rounded-xl border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {res.result.latex}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
