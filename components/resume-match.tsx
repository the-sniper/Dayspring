"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";
import {
  Gauge,
  Sparkles,
  Loader2,
  Upload,
  FileText,
  UserCircle,
  Check,
  X,
  AlertTriangle,
  Plus,
  ArrowRight,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  AlertCircle,
  RefreshCw,
  PencilRuler,
} from "lucide-react";
import {
  analyzeResumeMatchAction,
  alignResumeMatchAction,
} from "@/lib/actions/match";
import type { MatchAnalysis, MatchStatus } from "@/lib/claude/resume-match";
import type { ResumeDocType } from "@/lib/claude/resume";
import type { ResumeAudit } from "@/lib/resumes/audit-types";
import { DEFAULT_STYLE } from "@/lib/resumes/style";
import { cn } from "@/lib/utils";

// The studio pulls in @react-pdf/renderer + pdfjs — client-only, load on use.
const ResumeEditor = dynamic(() => import("@/components/resume-editor"), {
  ssr: false,
});

type ProfileOpt = { id: string; name: string; isDefault: boolean };
type MasterOpt = { id: string; label: string; isPrimary: boolean };
type SavedJob = {
  id: string;
  title: string;
  companyName: string | null;
  description: string;
};

const ALIGN_SECTIONS = ["Summary", "Skills", "Work Experience", "Projects"];

function scoreBand(score: number): {
  label: string;
  text: string;
  ring: string;
  chip: string;
} {
  if (score >= 85)
    return {
      label: "Excellent",
      text: "text-emerald-600 dark:text-emerald-400",
      ring: "text-emerald-500",
      chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    };
  if (score >= 70)
    return {
      label: "Good",
      text: "text-brand-600 dark:text-brand-400",
      ring: "text-brand-500",
      chip: "bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-400",
    };
  if (score >= 50)
    return {
      label: "Fair",
      text: "text-amber-600 dark:text-amber-400",
      ring: "text-amber-500",
      chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    };
  return {
    label: "Poor",
    text: "text-rose-600 dark:text-rose-400",
    ring: "text-rose-500",
    chip: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400",
  };
}

function Gauge10({ score }: { score: number }) {
  const band = scoreBand(score);
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          className="stroke-secondary"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          stroke="currentColor"
          className={band.ring}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className={cn("font-display text-3xl font-semibold", band.text)}>
          {(score / 10).toFixed(1)}
        </span>
        <span className={cn("mt-1 text-[10px] font-bold uppercase tracking-widest", band.text)}>
          {band.label}
        </span>
      </div>
    </div>
  );
}

const STATUS_ICON: Record<MatchStatus, typeof Check> = {
  match: Check,
  warn: AlertTriangle,
  miss: X,
};
const STATUS_STYLE: Record<MatchStatus, string> = {
  match: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
  warn: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
  miss: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400",
};

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Set up", "See your difference", "Align & download"];
  return (
    <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                  active
                    ? "bg-brand-500 text-white"
                    : done
                      ? "bg-emerald-500 text-white"
                      : "bg-secondary text-muted-foreground",
                )}
              >
                {done ? <Check size={13} strokeWidth={3} /> : n}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-bold sm:inline",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className="h-px w-6 bg-border sm:w-10" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ResumeMatch({
  profiles,
  masters,
  savedJobs,
  hasApiKey,
}: {
  profiles: ProfileOpt[];
  masters: MasterOpt[];
  savedJobs: SavedJob[];
  hasApiKey: boolean;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 input
  const [jd, setJd] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const defaultSource = useMemo(() => {
    const primary = masters.find((m) => m.isPrimary) ?? masters[0];
    if (primary) return `master:${primary.id}`;
    const def = profiles.find((p) => p.isDefault) ?? profiles[0];
    if (def) return `profile:${def.id}`;
    return "upload";
  }, [masters, profiles]);
  const [source, setSource] = useState<string>(defaultSource);
  const [file, setFile] = useState<File | null>(null);

  // Results
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeLabel, setResumeLabel] = useState("");
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Step 3 align
  const [sections, setSections] = useState<Set<string>>(new Set(ALIGN_SECTIONS));
  const [keywords, setKeywords] = useState<Set<string>>(new Set());
  const [alignResult, setAlignResult] = useState<{
    doc: ResumeDocType;
    audit: ResumeAudit | null;
    note: string;
  } | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [alignError, setAlignError] = useState<string | null>(null);
  const [aligning, startAlign] = useTransition();

  const canAnalyze =
    hasApiKey &&
    jd.trim().length >= 120 &&
    (source !== "upload" || !!file);

  function analyze() {
    setError(null);
    const fd = new FormData();
    fd.set("jd", jd.trim());
    fd.set("source", source);
    if (source === "upload" && file) fd.set("file", file);
    startTransition(async () => {
      const res = await analyzeResumeMatchAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAnalysis(res.analysis);
      setResumeText(res.resumeText);
      setResumeLabel(res.resumeLabel);
      setParseWarning(res.parseWarning);
      setSections(new Set(ALIGN_SECTIONS));
      setKeywords(new Set(res.analysis.keywords.missing));
      setAlignResult(null);
      setStep(2);
    });
  }

  function align() {
    setAlignError(null);
    startAlign(async () => {
      const res = await alignResumeMatchAction({
        jd: jd.trim(),
        resumeText,
        sections: [...sections],
        keywords: [...keywords],
        title: jobTitle || null,
      });
      if (!res.ok) {
        setAlignError(res.error);
        return;
      }
      setAlignResult({ doc: res.doc, audit: res.audit, note: res.note });
      // Straight into review — the studio previews, edits, and downloads.
      setStudioOpen(true);
    });
  }

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  return (
    <div>
      <Stepper step={step} />

      {!hasApiKey && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50/50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          Resume Match needs an ANTHROPIC_API_KEY — add one in Settings → API Keys.
        </div>
      )}

      {/* ── Step 1: Set up ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-sm font-bold text-foreground">
                Job description
              </label>
              {savedJobs.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const j = savedJobs.find((s) => String(s.id) === e.target.value);
                    if (j) {
                      setJd(j.description);
                      setJobTitle(j.title);
                    }
                  }}
                  className="max-w-[220px] rounded-lg border border-border bg-secondary/30 px-2 py-1 text-xs font-medium text-foreground transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 cursor-pointer"
                >
                  <option value="">Load from a saved job…</option>
                  {savedJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                      {j.companyName ? ` · ${j.companyName}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={8}
              placeholder="Paste the full job description here…"
              className="w-full resize-y rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm leading-relaxed transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50"
            />
            <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
              {jd.trim().length < 120
                ? `${jd.trim().length}/120 characters minimum`
                : `${jd.trim().length} characters`}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-foreground">
              Target job title{" "}
              <span className="font-medium text-muted-foreground">(optional)</span>
            </label>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder='Exact title from the posting, e.g. "Senior Product Manager"'
              className="w-full rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50"
            />
            <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
              Resumes that mirror the exact posted title get ~10x more callbacks
              — the aligned resume will use it verbatim.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-foreground">
              Resume to score
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {masters.map((m) => (
                <SourceCard
                  key={`master:${m.id}`}
                  active={source === `master:${m.id}`}
                  onClick={() => setSource(`master:${m.id}`)}
                  icon={<FileText size={16} />}
                  title={m.label}
                  subtitle={m.isPrimary ? "Master · Primary" : "Master resume"}
                />
              ))}
              {profiles.map((p) => (
                <SourceCard
                  key={`profile:${p.id}`}
                  active={source === `profile:${p.id}`}
                  onClick={() => setSource(`profile:${p.id}`)}
                  icon={<UserCircle size={16} />}
                  title={p.name}
                  subtitle={p.isDefault ? "Profile · Default" : "Profile"}
                />
              ))}
              <SourceCard
                active={source === "upload"}
                onClick={() => setSource("upload")}
                icon={<Upload size={16} />}
                title={file ? file.name : "Upload a PDF"}
                subtitle="One-off · not saved"
              />
            </div>

            {source === "upload" && (
              <div className="mt-3">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-brand-600"
                />
                <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                  PDF only. It&apos;s parsed for this analysis and never saved to
                  your library.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="flex items-start gap-2 text-xs font-medium text-destructive">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!canAnalyze || pending}
            onClick={analyze}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-50 disabled:hover:bg-brand-500 cursor-pointer disabled:cursor-not-allowed"
          >
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Gauge size={16} />
                Score my resume
              </>
            )}
          </button>
          {source === "upload" && pending && (
            <p className="text-[11px] font-medium text-muted-foreground">
              Reading the PDF then scoring — uploads take a little longer.
            </p>
          )}
        </div>
      )}

      {/* ── Step 2: See your difference ────────────────────────────── */}
      {step === 2 && analysis && (
        <div className="space-y-6">
          {parseWarning && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50/50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {parseWarning}
            </div>
          )}

          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-secondary/20 p-5 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <Gauge10 score={analysis.atsScore} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  ATS score
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Gauge10 score={analysis.score} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Experience fit
                </span>
              </div>
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h3 className="font-display text-xl font-semibold text-foreground">
                {analysis.score >= 70
                  ? "Strong match for this job"
                  : analysis.score >= 50
                    ? "Partial match — worth improving"
                    : "Low match for this job"}
              </h3>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {analysis.fitSummary}
              </p>
              <p className="mt-2 text-xs font-medium text-muted-foreground/80">
                ATS score measures keyword searchability — aligning the resume
                drives it toward 8.5+. Experience fit reflects your actual
                background and won&apos;t move much from rewording.
              </p>
            </div>
          </div>

          {/* ATS searchability checks */}
          {analysis.atsChecks.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border">
              {analysis.atsChecks.map((c, i) => {
                const status: MatchStatus =
                  c.status === "pass" ? "match" : c.status === "warn" ? "warn" : "miss";
                const Icon = STATUS_ICON[status];
                return (
                  <div
                    key={c.label}
                    className={cn(
                      "flex items-start gap-3 px-4 py-2.5",
                      i > 0 && "border-t border-border/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        STATUS_STYLE[status],
                      )}
                    >
                      <Icon size={11} strokeWidth={3} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">{c.label}</p>
                      <p className="text-xs font-medium text-muted-foreground">{c.note}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Comparison rows */}
          <div className="overflow-hidden rounded-xl border border-border">
            {analysis.rows.map((row, i) => {
              const Icon = STATUS_ICON[row.status];
              return (
                <div
                  key={row.label}
                  className={cn(
                    "grid grid-cols-[1fr] gap-2 p-3 sm:grid-cols-[160px_1fr_1fr] sm:items-center",
                    i > 0 && "border-t border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        STATUS_STYLE[row.status],
                      )}
                    >
                      <Icon size={12} strokeWidth={3} />
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      {row.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground sm:border-l sm:border-border/60 sm:pl-3">
                    <span className="font-semibold text-foreground/60">Job: </span>
                    {row.jobValue}
                  </div>
                  <div className="text-xs text-muted-foreground sm:border-l sm:border-border/60 sm:pl-3">
                    <span className="font-semibold text-foreground/60">You: </span>
                    {row.resumeValue}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Keywords */}
          <div className="rounded-xl border border-border p-4">
            <p className="mb-3 text-xs font-bold text-foreground">
              Job keywords{" "}
              <span className="font-medium text-muted-foreground">
                ({analysis.keywords.matched.length}/
                {analysis.keywords.matched.length + analysis.keywords.missing.length})
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.keywords.matched.map((k) => (
                <span
                  key={`m-${k}`}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                >
                  <ThumbsUp size={10} />
                  {k}
                </span>
              ))}
              {analysis.keywords.missing.map((k) => (
                <span
                  key={`x-${k}`}
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  <Plus size={10} />
                  {k}
                </span>
              ))}
              {analysis.keywords.matched.length === 0 &&
                analysis.keywords.missing.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No specific keywords detected.
                  </span>
                )}
            </div>
          </div>

          {/* Strengths / weaknesses / improvements */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <AdviceCard
              title="What's good"
              icon={<ThumbsUp size={14} />}
              tone="good"
              items={analysis.strengths}
            />
            <AdviceCard
              title="What's not"
              icon={<ThumbsDown size={14} />}
              tone="bad"
              items={analysis.weaknesses}
            />
            <AdviceCard
              title="How to improve"
              icon={<Lightbulb size={14} />}
              tone="tip"
              items={analysis.improvements}
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground transition-all hover:border-brand-500 hover:text-brand-600 active:scale-95 cursor-pointer"
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-95 cursor-pointer"
            >
              <Sparkles size={16} />
              Align my resume
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Align & download ───────────────────────────────── */}
      {step === 3 && analysis && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-bold text-foreground">
                Sections to enhance
              </p>
              <div className="space-y-2">
                {ALIGN_SECTIONS.map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-secondary/20 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/40"
                  >
                    <input
                      type="checkbox"
                      checked={sections.has(s)}
                      onChange={() => toggle(sections, setSections, s)}
                      className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500 cursor-pointer"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold text-foreground">
                  Missing keywords to weave in
                </p>
                {analysis.keywords.missing.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setKeywords(
                        keywords.size === analysis.keywords.missing.length
                          ? new Set()
                          : new Set(analysis.keywords.missing),
                      )
                    }
                    className="text-[11px] font-bold text-brand-600 hover:underline cursor-pointer dark:text-brand-400"
                  >
                    {keywords.size === analysis.keywords.missing.length
                      ? "Clear all"
                      : "Select all"}
                  </button>
                )}
              </div>
              {analysis.keywords.missing.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-xs font-medium text-muted-foreground">
                  No missing keywords — your resume already covers the JD&apos;s
                  hard skills.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.keywords.missing.map((k) => {
                    const on = keywords.has(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggle(keywords, setKeywords, k)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer",
                          on
                            ? "bg-brand-500 text-white"
                            : "bg-secondary text-muted-foreground hover:bg-secondary/70",
                        )}
                      >
                        {on ? <Check size={10} strokeWidth={3} /> : <Plus size={10} />}
                        {k}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                Keywords are only added where your resume genuinely supports them
                — nothing is fabricated.
              </p>
            </div>
          </div>

          {alignError && (
            <p className="flex items-start gap-2 text-xs font-medium text-destructive">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {alignError}
            </p>
          )}

          {alignResult ? (
            <div className="space-y-3 rounded-2xl border border-border bg-secondary/20 p-4">
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-brand-500" />
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Your aligned resume is ready to review
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    {alignResult.note}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStudioOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-95 cursor-pointer"
                >
                  <PencilRuler size={15} />
                  Review, edit &amp; download
                </button>
                <button
                  type="button"
                  disabled={aligning}
                  onClick={align}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground transition-all hover:border-brand-500 hover:text-brand-600 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {aligning ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <RefreshCw size={15} />
                  )}
                  Regenerate
                </button>
              </div>
              <p className="text-[11px] font-medium text-muted-foreground">
                The studio highlights every AI change, flags anything your
                original resume doesn&apos;t support, and downloads PDF or DOCX.
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground transition-all hover:border-brand-500 hover:text-brand-600 active:scale-95 cursor-pointer"
            >
              <ArrowLeft size={15} />
              Back
            </button>
            {!alignResult && (
              <button
                type="button"
                disabled={aligning || sections.size === 0}
                onClick={align}
                className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-50 disabled:hover:bg-brand-500 cursor-pointer disabled:cursor-not-allowed"
              >
                {aligning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Aligning…
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Generate aligned resume
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {studioOpen && alignResult && (
        <ResumeEditor
          doc={alignResult.doc}
          style={DEFAULT_STYLE}
          audit={alignResult.audit}
          sourceText={resumeText}
          jd={jd.trim()}
          resumeId={null}
          filename={`aligned-${resumeLabel || "resume"}`}
          initialScore={analysis?.atsScore ?? null}
          initialAnalysis={analysis}
          onClose={() => setStudioOpen(false)}
        />
      )}
    </div>
  );
}

function SourceCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer",
        active
          ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500/30 dark:bg-brand-950/20"
          : "border-border bg-secondary/20 hover:border-brand-500/40 hover:bg-secondary/40",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          active
            ? "bg-brand-500 text-white"
            : "bg-card text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-foreground">
          {title}
        </span>
        <span className="block truncate text-[11px] font-medium text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function AdviceCard({
  title,
  icon,
  tone,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "good" | "bad" | "tip";
  items: string[];
}) {
  const toneStyle = {
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-rose-600 dark:text-rose-400",
    tip: "text-brand-600 dark:text-brand-400",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-secondary/10 p-4">
      <p className={cn("mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider", toneStyle)}>
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs font-medium text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-xs font-medium leading-relaxed text-muted-foreground"
            >
              <span className={cn("mt-1 block h-1 w-1 shrink-0 rounded-full", toneStyle, "bg-current")} />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
