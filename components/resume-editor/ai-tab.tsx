"use client";

// AI Rewrite tab — the review heart of the studio. Shows the fabrication
// audit (what the AI adjusted, what has no basis in your source resume, with
// source quotes to compare), per-finding edit/delete, a match-score gauge with
// before→after jump on rescore, canned suggestion chips, and free-form
// Edit-with-AI (re-audited every pass).
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Wand2,
} from "lucide-react";
import type { ResumeDocType } from "@/lib/claude/resume";
import type { MatchAnalysis } from "@/lib/claude/resume-match";
import type { AuditFinding, ResumeAudit } from "@/lib/resumes/audit-types";
import {
  aiEditResumeAction,
  auditResumeAction,
  categorizeSkillAction,
  rescoreResumeAction,
} from "@/lib/actions/editor";
import { alignResumeMatchAction } from "@/lib/actions/match";
import { cn } from "@/lib/utils";
import { deleteAtPath, describePath, getAtPath, locateText, setAtPath } from "./doc-utils";

const CHIPS = [
  "Use stronger action verbs",
  "Shorten my summary",
  "Remove skills not related to this job",
  "Make bullets more quantified",
  "Tighten every bullet to under 20 words",
];

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-brand-600 dark:text-brand-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export default function AiTab({
  view,
  doc,
  audit,
  jd,
  sourceText,
  initialScore,
  onDoc,
  onAudit,
}: {
  // Same instance renders two tabs so they share score/audit/added-skill state:
  // "optimize" = scores + raise-your-score + fabrication review; "ask" = the
  // free-form Edit-with-AI console.
  view: "optimize" | "ask";
  doc: ResumeDocType;
  audit: ResumeAudit | null;
  jd: string;
  sourceText: string;
  initialScore: number | null;
  onDoc: (d: ResumeDocType) => void;
  onAudit: (a: ResumeAudit | null) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [editing, startEdit] = useTransition();

  // ATS searchability score — the controllable, editable one (target 85+).
  const [ats, setAts] = useState<number | null>(initialScore);
  const [prevAts, setPrevAts] = useState<number | null>(null);
  // Experience-fit score — mostly immovable by editing; shown for honesty.
  const [fit, setFit] = useState<number | null>(null);
  // Full analyzer output from the latest rescore — drives the actionable
  // "Raise your score" section (checks, missing keywords, improvements).
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoring, startScore] = useTransition();

  // Skills the user adds that the uploaded source didn't mention. Folded into
  // the source of truth so the never-fabricate audit treats them as supported
  // across later edits. addingKws = chips mid-add (per-chip spinner, so several
  // can be added at once); addedKws = already added (hidden from the lists).
  const [extraFacts, setExtraFacts] = useState("");
  const [addingKws, setAddingKws] = useState<Set<string>>(new Set());
  const [addedKws, setAddedKws] = useState<Set<string>>(new Set());
  // Which heavy action is running, so ONLY that button shows a spinner (adding a
  // skill no longer makes "Fix all"/"Deep optimize" appear to run).
  const [runningId, setRunningId] = useState<"fixall" | "deep" | "ai" | null>(null);
  // Set after a skill add (or any edit that skips auto-rescore) so the score is
  // flagged out-of-date until the user chooses to rescore — one slow call, on
  // demand, instead of one after every click.
  const [scoreStale, setScoreStale] = useState(false);

  // Latest doc, readable synchronously so concurrent skill-adds don't clobber
  // each other (each reads the freshest doc rather than a stale closure).
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const effectiveSource = extraFacts
    ? `${sourceText}\n\nADDITIONAL SKILLS (candidate-confirmed):\n${extraFacts}`
    : sourceText;

  function applyScores(a: MatchAnalysis) {
    setPrevAts(ats);
    setAts(a.atsScore);
    setScoreStale(false);
    // Experience fit is a property of the candidate's background + the JD, not of
    // wording — so pin it on the first score and hold it. The scorer (Sonnet 5,
    // no temperature control) jitters a few points per run; recomputing fit on
    // every edit made it look like rewording was hurting qualifications, which is
    // impossible. Only the ATS score, which editing genuinely targets, moves.
    setFit((prev) => (prev === null ? a.score : prev));
    setAnalysis(a);
  }

  // Findings still present in the doc, unsupported first. Items the user
  // edited or deleted drop out automatically (text no longer matches).
  const findings = useMemo(() => {
    const live = (audit?.findings ?? []).filter(
      (f) => f.status !== "supported" && locateText(doc, f.text) !== null,
    );
    return live.sort((a, b) =>
      a.status === b.status ? 0 : a.status === "unsupported" ? -1 : 1,
    );
  }, [audit, doc]);
  const supportedCount = useMemo(
    () => (audit?.findings ?? []).filter((f) => f.status === "supported").length,
    [audit],
  );

  // Triage missing JD keywords against the source resume: ones the source
  // mentions can be woven in honestly; the rest are a hard ceiling — the AI
  // refuses to fabricate them, so surface that instead of a silent no-op.
  const missingKw = useMemo(() => {
    const src = effectiveSource.toLowerCase();
    const addable: string[] = [];
    const blocked: string[] = [];
    for (const k of analysis?.keywords.missing ?? []) {
      if (addedKws.has(k)) continue; // already added to Skills this session
      (src.includes(k.toLowerCase()) ? addable : blocked).push(k);
    }
    return { addable, blocked };
  }, [analysis, effectiveSource, addedKws]);

  function runAi(
    text: string,
    thenRescore = false,
    sourceOverride?: string,
    id: "fixall" | "deep" | "ai" = "ai",
  ) {
    if (!text.trim() || editing) return;
    setAiError(null);
    setAiNote(null);
    setRunningId(id);
    startEdit(async () => {
      try {
        const src = sourceOverride ?? effectiveSource;
        const res = await aiEditResumeAction({
          doc: docRef.current,
          sourceText: src,
          jd,
          instruction: text,
        });
        if (!res.ok) {
          setAiError(res.error);
          return;
        }
        onDoc(res.doc);
        setAiNote(res.note);
        setInstruction("");
        // Audit and rescore are independent of each other — run them together
        // rather than chaining, so the whole action is one edit + one parallel
        // wait instead of three slow model calls in series.
        const [aud, scored] = await Promise.all([
          auditResumeAction({ sourceText: src, doc: res.doc }),
          thenRescore && jd.trim()
            ? rescoreResumeAction({ doc: res.doc, jd })
            : Promise.resolve(null),
        ]);
        if (aud.ok) onAudit(aud.audit);
        if (scored && scored.ok) applyScores(scored.analysis);
      } finally {
        setRunningId(null);
      }
    });
  }

  // Add a missing keyword straight into the Skills section, dropped into the
  // best category bucket (a fast Haiku call). Independent of the heavy-edit
  // transition, so it never spins "Fix all"/"Deep optimize", several can run at
  // once, and it does NOT auto-rescore — it just flags the score stale so the
  // user runs one rescore when they're done adding.
  async function addKeyword(k: string) {
    if (addingKws.has(k) || addedKws.has(k) || editing) return;
    setAiError(null);
    setAddingKws((s) => new Set(s).add(k));
    try {
      const current = docRef.current;
      const already = current.skills.some((g) =>
        g.items.some((it) => it.toLowerCase() === k.toLowerCase()),
      );
      let groupName = current.skills[0]?.group ?? "Skills";
      if (!already) {
        const cat = await categorizeSkillAction({
          keyword: k,
          groups: current.skills.map((g) => g.group),
        });
        if (cat.ok) groupName = cat.group;
        // Re-read the freshest doc after the await so parallel adds don't clobber.
        const base = docRef.current;
        const skills = base.skills.map((g) => ({ ...g, items: [...g.items] }));
        const idx = skills.findIndex(
          (g) => g.group.toLowerCase() === groupName.toLowerCase(),
        );
        if (idx >= 0) skills[idx].items.push(k);
        else skills.push({ group: groupName, items: [k] });
        const nextDoc = { ...base, skills };
        docRef.current = nextDoc;
        onDoc(nextDoc);
      }
      setExtraFacts((prev) => (prev ? `${prev}\n- ${k}` : `- ${k}`));
      setAddedKws((s) => new Set(s).add(k));
      setScoreStale(true);
    } finally {
      setAddingKws((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  }

  function rescore() {
    if (!jd.trim() || scoring) return;
    setScoreError(null);
    startScore(async () => {
      const res = await rescoreResumeAction({ doc, jd });
      if (!res.ok) {
        setScoreError(res.error);
        return;
      }
      applyScores(res.analysis);
    });
  }

  // One combined optimization pass built from the analyzer's own findings:
  // exact-title mirroring, missing JD keywords, and its top suggested edits.
  // aiEdit enforces never-fabricate, so only honestly-supported items land.
  function boostScore() {
    if (!analysis) return;
    const parts: string[] = [];
    const titleRow = analysis.rows.find(
      (r) => r.label === "Job Title" && r.status !== "match",
    );
    if (titleRow) {
      parts.push(
        `Mirror the exact posted job title ("${titleRow.jobValue}") verbatim in the headline and once in the summary.`,
      );
    }
    if (missingKw.addable.length) {
      parts.push(
        `Weave in these JD keywords verbatim wherever the source resume genuinely supports them (skip any it does not): ${missingKw.addable.join(", ")}.`,
      );
    }
    const failing = analysis.atsChecks.filter((c) => c.status !== "pass");
    if (failing.length) {
      parts.push(
        `Fix these ATS-searchability issues:\n${failing.map((c) => `- ${c.label}: ${c.note}`).join("\n")}`,
      );
    }
    if (analysis.improvements.length) {
      parts.push(
        `Apply these improvements where the source supports them:\n${analysis.improvements.map((im, i) => `${i + 1}. ${im}`).join("\n")}`,
      );
    }
    if (!parts.length) return;
    runAi(parts.join("\n\n"), true, undefined, "fixall");
  }

  // Nuclear option: regenerate the whole resume from the source text with the
  // full JD-alignment prompt (exact title, 25–35 verbatim keywords, evidence
  // bullets). Incremental edits preserve structure by design and plateau —
  // a full rebuild is how you actually reach 8.5+.
  function deepOptimize() {
    if (!jd.trim() || editing) return;
    if (
      !window.confirm(
        "Deep optimize rebuilds the resume from your source, replacing any manual edits made in the studio. Continue?",
      )
    )
      return;
    setAiError(null);
    setAiNote(null);
    setRunningId("deep");
    startEdit(async () => {
      try {
        const titleRow = analysis?.rows.find((r) => r.label === "Job Title");
        const res = await alignResumeMatchAction({
          jd,
          resumeText: effectiveSource,
          sections: ["Summary", "Skills", "Work Experience", "Projects"],
          keywords: [
            ...(analysis?.keywords.matched ?? []),
            ...missingKw.addable,
          ],
          title: titleRow?.jobValue ?? null,
        });
        if (!res.ok) {
          setAiError(res.error);
          return;
        }
        // Keep the winner: score the rebuild BEFORE committing it. If it doesn't
        // beat the current ATS score, the source has hit its honest ceiling —
        // keep the existing doc (and the user's edits) rather than swapping in a
        // worse one.
        const scored = await rescoreResumeAction({ doc: res.doc, jd });
        if (scored.ok && ats !== null && scored.analysis.atsScore < ats) {
          setAiNote(
            `Deep optimize scored ${(scored.analysis.atsScore / 10).toFixed(1)} — not higher than your current ${(ats / 10).toFixed(1)}, so I kept your current version. Your resume is at its honest ceiling for this JD; raise it by clicking the missing skills below to add ones you genuinely have.`,
          );
          return;
        }
        onDoc(res.doc);
        onAudit(res.audit);
        setAiNote(res.note);
        if (scored.ok) applyScores(scored.analysis);
      } finally {
        setRunningId(null);
      }
    });
  }

  if (view === "ask") {
    return (
      <div className="space-y-4 p-4">
        {/* ── Edit with AI ─────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles size={14} className="text-brand-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Edit with AI
            </h3>
          </div>
          <p className="mb-2.5 text-xs font-medium leading-relaxed text-muted-foreground">
            Tell the AI what to change in plain language. Every edit obeys the
            same never-fabricate rules and is re-audited. Run a Rescore in the
            Optimize tab afterward to see the score impact.
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={editing}
                onClick={() => runAi(c)}
                className="rounded-full border border-border bg-secondary/30 px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:border-brand-500/40 hover:text-brand-600 disabled:opacity-50 cursor-pointer"
              >
                {c}
              </button>
            ))}
          </div>
          <div className="relative">
            <textarea
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runAi(instruction);
              }}
              placeholder='e.g. "Lead with the platform migration work" or "Merge the two oldest roles"…'
              className="w-full resize-y rounded-xl border border-border bg-secondary/30 px-3 py-2.5 pr-11 text-xs font-medium leading-relaxed transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50"
            />
            <button
              type="button"
              disabled={editing || !instruction.trim()}
              onClick={() => runAi(instruction)}
              className="absolute bottom-2.5 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-40 cursor-pointer"
              aria-label="Apply AI edit"
            >
              {editing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
          {editing && (
            <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
              Applying your edit under the same never-fabricate rules, then
              re-auditing — ~20–40s.
            </p>
          )}
          {aiNote && !editing && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-medium text-brand-600 dark:text-brand-400">
              <Sparkles size={11} className="mt-0.5 shrink-0" />
              {aiNote}
            </p>
          )}
          {aiError && (
            <p className="mt-1.5 text-[11px] font-medium text-destructive">{aiError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* ── Scores ─────────────────────────────────────────────────── */}
      {jd.trim() && (
        <div className="rounded-xl border border-border bg-secondary/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-5">
              <div className="flex flex-col leading-none">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  ATS score
                </span>
                <span className="mt-1 flex items-baseline gap-2">
                  <span
                    className={cn(
                      "font-display text-2xl font-semibold",
                      ats !== null ? scoreColor(ats) : "text-muted-foreground",
                    )}
                  >
                    {ats !== null ? (ats / 10).toFixed(1) : "—"}
                  </span>
                  {scoreStale ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      Out of date
                    </span>
                  ) : (
                    prevAts !== null &&
                    ats !== null &&
                    prevAts !== ats && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5 text-xs font-bold",
                          ats > prevAts
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        <TrendingUp size={12} className={ats < prevAts ? "rotate-180" : ""} />
                        {(prevAts / 10).toFixed(1)} → {(ats / 10).toFixed(1)}
                      </span>
                    )
                  )}
                </span>
              </div>
              {fit !== null && (
                <div className="flex flex-col leading-none border-l border-border/60 pl-5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Experience fit
                  </span>
                  <span
                    className={cn(
                      "mt-1 font-display text-2xl font-semibold opacity-80",
                      scoreColor(fit),
                    )}
                  >
                    {(fit / 10).toFixed(1)}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={scoring}
              onClick={rescore}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer",
                scoreStale
                  ? "border-amber-500/60 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                  : "border-border text-foreground hover:border-brand-500/40 hover:text-brand-600",
              )}
            >
              {scoring ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {ats === null ? "Score vs JD" : "Rescore"}
            </button>
          </div>
          <p className="mt-2 text-[10px] font-medium leading-relaxed text-muted-foreground">
            ATS score = keyword searchability — editing drives it; target 8.5+.
            Experience fit reflects your actual background, so editing can&apos;t
            change it.
          </p>
        </div>
      )}
      {scoreError && (
        <p className="text-[11px] font-medium text-destructive">{scoreError}</p>
      )}

      {/* ── Raise your score ───────────────────────────────────────── */}
      {analysis && (
        <div className="rounded-xl border border-border bg-secondary/10 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-foreground">
              <Lightbulb size={12} className="text-brand-500" />
              Raise your score
            </span>
            <div className="flex items-center gap-1.5">
              {(analysis.keywords.missing.length > 0 ||
                analysis.improvements.length > 0) && (
                <button
                  type="button"
                  disabled={editing}
                  onClick={boostScore}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 py-1.5 text-[11px] font-bold text-white transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {runningId === "fixall" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Rocket size={12} />
                  )}
                  Fix all with AI
                </button>
              )}
              <button
                type="button"
                disabled={editing}
                onClick={deepOptimize}
                title="Rebuild the whole resume from your source, fully JD-aligned — the strongest ATS pass, but replaces manual studio edits"
                className="flex items-center gap-1.5 rounded-lg border border-brand-500/50 px-2.5 py-1.5 text-[11px] font-bold text-brand-600 transition-all hover:bg-brand-50 active:scale-95 disabled:opacity-50 cursor-pointer dark:text-brand-400 dark:hover:bg-brand-950/30"
              >
                {runningId === "deep" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                Deep optimize
              </button>
            </div>
          </div>

          {analysis.atsChecks.length > 0 && (
            <div className="mb-2.5 space-y-1">
              {analysis.atsChecks.map((c) => (
                <div key={c.label} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                      c.status === "pass"
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                        : c.status === "warn"
                          ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                          : "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400",
                    )}
                  >
                    {c.status === "pass" ? (
                      <Check size={10} strokeWidth={3} />
                    ) : (
                      <AlertTriangle size={9} strokeWidth={3} />
                    )}
                  </span>
                  <p className="text-[11px] font-medium leading-snug text-muted-foreground">
                    <span className="font-bold text-foreground/80">{c.label}: </span>
                    {c.note}
                  </p>
                </div>
              ))}
            </div>
          )}

          {missingKw.addable.length > 0 && (
            <div className="mb-2.5">
              <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">
                Missing JD keywords your source supports — click to weave in
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingKw.addable.map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={editing}
                    onClick={() =>
                      runAi(
                        `Weave the JD keyword "${k}" (verbatim) into the resume wherever the source resume genuinely supports it — summary, skills, or a relevant bullet. If the source does not support it, change nothing.`,
                        true,
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-brand-500 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    <Plus size={10} />
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}

          {missingKw.blocked.length > 0 && (
            <div className="mb-2.5">
              <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">
                Not in your resume — click to add to your skills
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingKw.blocked.map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={editing || addingKws.has(k)}
                    onClick={() => addKeyword(k)}
                    title="Add this skill to the best-matching category in your Skills section"
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] font-bold text-muted-foreground/70 transition-colors hover:border-brand-500/50 hover:bg-brand-500 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    {addingKws.has(k) ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Plus size={10} />
                    )}
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}

          {analysis.improvements.length > 0 && (
            <ul className="space-y-1.5">
              {analysis.improvements.map((im, i) => (
                <li key={i} className="flex items-start gap-2">
                  <button
                    type="button"
                    disabled={editing}
                    onClick={() =>
                      runAi(
                        `${im} (Apply only where the source resume honestly supports it.)`,
                        true,
                      )
                    }
                    title="Apply this improvement with AI"
                    className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border text-brand-600 transition-colors hover:border-brand-500 hover:bg-brand-50 disabled:opacity-50 cursor-pointer dark:text-brand-400 dark:hover:bg-brand-950/30"
                  >
                    <Wand2 size={11} />
                  </button>
                  <span className="text-xs font-medium leading-relaxed text-muted-foreground">
                    {im}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {analysis.weaknesses.length > 0 && (
            <p className="mt-2.5 border-t border-border/60 pt-2 text-[11px] font-medium leading-relaxed text-muted-foreground">
              <span className="font-bold text-foreground/70">
                What rewording can&apos;t fix:{" "}
              </span>
              {analysis.weaknesses.join(" · ")}. These show up in the
              experience-fit score, which wording changes can&apos;t move —
              focus on driving the ATS score to 8.5+.
            </p>
          )}
        </div>
      )}

      {/* ── What changed ───────────────────────────────────────────── */}
      {audit ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck size={14} className="text-brand-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              What changed
            </h3>
          </div>
          <p className="mb-3 text-xs font-medium leading-relaxed text-muted-foreground">
            {audit.summary}
          </p>

          {findings.length === 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-300/40 bg-emerald-50/50 p-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
              <Check size={14} className="mt-0.5 shrink-0" />
              Everything remaining is fully supported by your source resume
              {supportedCount > 0 ? ` (${supportedCount} items verified)` : ""}.
            </div>
          ) : (
            <div className="space-y-2">
              {findings.map((f) => (
                <FindingCard
                  key={`${f.path}:${f.text.slice(0, 40)}`}
                  finding={f}
                  doc={doc}
                  onDoc={onDoc}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50/50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          The fabrication audit didn&apos;t run for this resume — review each
          section manually in the Editor tab before applying.
        </div>
      )}

      {/* Applied-edit feedback (also shown here when an edit runs from the
          Optimize tab actions — Fix all, keyword weaves, improvements). */}
      {aiNote && !editing && (
        <p className="flex items-start gap-1.5 text-[11px] font-medium text-brand-600 dark:text-brand-400">
          <Sparkles size={11} className="mt-0.5 shrink-0" />
          {aiNote}
        </p>
      )}
      {aiError && (
        <p className="text-[11px] font-medium text-destructive">{aiError}</p>
      )}
    </div>
  );
}

// ── One audit finding ─────────────────────────────────────────────────────────

function FindingCard({
  finding,
  doc,
  onDoc,
}: {
  finding: AuditFinding;
  doc: ResumeDocType;
  onDoc: (d: ResumeDocType) => void;
}) {
  const [compare, setCompare] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(finding.text);
  const unsupported = finding.status === "unsupported";
  // Re-locate by text — earlier deletes may have shifted indices.
  const path = locateText(doc, finding.text) ?? finding.path;
  const exists = getAtPath(doc, path)?.trim() === finding.text.trim();

  if (!exists) return null;

  function applyEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === finding.text.trim()) {
      setEditing(false);
      return;
    }
    onDoc(setAtPath(doc, path, trimmed));
    setEditing(false);
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        unsupported
          ? "border-rose-300/50 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/15"
          : "border-emerald-300/50 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/15",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
            unsupported
              ? "text-rose-700 dark:text-rose-400"
              : "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {unsupported ? <AlertTriangle size={11} /> : <Check size={11} />}
          {unsupported ? "Not in your source — verify or remove" : "Adjusted"}
          <span className="font-medium normal-case tracking-normal text-muted-foreground">
            · {describePath(doc, path)}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              setDraft(finding.text);
              setEditing((v) => !v);
            }}
            title="Edit this line"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 cursor-pointer"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={() => onDoc(deleteAtPath(doc, path))}
            title="Remove from the resume"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/40 cursor-pointer"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-1">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full resize-y rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium leading-relaxed focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            autoFocus
          />
          <div className="mt-1 flex gap-1.5">
            <button
              type="button"
              onClick={applyEdit}
              className="rounded-lg bg-brand-500 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-600 cursor-pointer"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs font-medium leading-relaxed text-foreground">
          {finding.text}
        </p>
      )}

      {finding.note && (
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">
          {finding.note}
        </p>
      )}

      {finding.sourceQuote && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setCompare((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            <Quote size={10} />
            Compare to original
            <ChevronDown
              size={11}
              className={cn("transition-transform", compare && "rotate-180")}
            />
          </button>
          {compare && (
            <blockquote className="mt-1 rounded-lg border-l-2 border-border bg-card/70 px-2.5 py-1.5 text-[11px] font-medium italic leading-relaxed text-muted-foreground">
              “{finding.sourceQuote}”
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}
