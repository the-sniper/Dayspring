"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import {
  FileBadge,
  Sparkles,
  Loader2,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  FileDown,
  PencilRuler,
} from "lucide-react";
import {
  generateResumeAction,
  loadGeneratedResumeAction,
  type StudioPayload,
} from "@/lib/actions/resumes";

// The studio pulls in @react-pdf/renderer + pdfjs — client-only, load on use.
const ResumeEditor = dynamic(() => import("@/components/resume-editor"), {
  ssr: false,
});

type Generated = {
  id: string;
  tailoringNote: string | null;
  createdAt: string;
} | null;

// Per-JD tailored resume: opus selects/rephrases across the master corpus
// (never invents), a fabrication audit flags anything unsupported, and the
// review studio opens before anything reaches an application.
export default function ResumeStudio({
  jobId,
  initial,
  mastersCount,
  hasApiKey,
}: {
  jobId: string;
  initial: Generated;
  mastersCount: number;
  hasApiKey: boolean;
}) {
  const [current, setCurrent] = useState<Generated>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [studio, setStudio] = useState<StudioPayload | null>(null);
  const [studioId, setStudioId] = useState<string | null>(null);
  const [opening, startOpen] = useTransition();

  const ready = mastersCount > 0 && hasApiKey;

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await generateResumeAction(jobId);
      if (res.ok) {
        setCurrent({ id: res.id, tailoringNote: res.tailoringNote, createdAt: res.createdAt });
        // Straight into review — nothing AI-made ships unreviewed.
        setStudio(res.studio);
        setStudioId(res.id);
      } else {
        setError(res.error);
      }
    });
  }

  function openStudio() {
    if (!current) return;
    setError(null);
    startOpen(async () => {
      const res = await loadGeneratedResumeAction(current.id);
      if (res.ok) {
        setStudio(res.studio);
        setStudioId(current.id);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileBadge size={20} className="text-brand-500" />
          <h2 className="text-lg font-bold text-foreground">Tailored Resume</h2>
        </div>
        {current && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Generated {current.createdAt.slice(0, 10)}
          </span>
        )}
      </div>

      <p className="mb-4 text-xs font-medium text-muted-foreground leading-relaxed">
        A one-page resume built for <em>this</em> job from your master resume
        {mastersCount === 1 ? "" : "s"} — strongest truthful content selected and
        re-angled to the JD, never invented. Every generation opens in the review
        studio with AI changes highlighted before you apply.
      </p>

      {mastersCount === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No master resume yet —{" "}
            <Link href="/settings" className="font-bold text-brand-600 hover:underline">
              upload one in Settings
            </Link>{" "}
            to enable per-job resumes.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || !ready}
            onClick={generate}
            title={hasApiKey ? undefined : "Needs ANTHROPIC_API_KEY"}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {pending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : current ? (
              <RefreshCw size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {pending ? "Building…" : current ? "Regenerate" : "Generate resume"}
          </button>
          {current && (
            <>
              <button
                type="button"
                disabled={opening}
                onClick={openStudio}
                className="flex items-center gap-2 rounded-xl border border-brand-500/40 bg-brand-50/50 px-4 py-2.5 text-sm font-bold text-brand-700 transition-all hover:bg-brand-100/60 active:scale-95 disabled:opacity-50 cursor-pointer dark:bg-brand-950/20 dark:text-brand-400 dark:hover:bg-brand-950/40"
              >
                {opening ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <PencilRuler size={16} />
                )}
                Review &amp; edit
              </button>
              <a
                href={`/api/resumes/${current.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-all hover:border-brand-500/40 hover:text-brand-600 active:scale-95 cursor-pointer"
              >
                <ExternalLink size={16} />
                Open PDF
              </a>
              <a
                href={`/api/resumes/${current.id}?format=docx`}
                title="DOCX parses most reliably across ATS platforms (Workday, Taleo, iCIMS…)"
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-all hover:border-brand-500/40 hover:text-brand-600 active:scale-95 cursor-pointer"
              >
                <FileDown size={16} />
                DOCX
              </a>
            </>
          )}
        </div>
      )}

      {current && !pending && (
        <p className="mt-3 text-[11px] font-medium text-muted-foreground">
          Tip: submit the DOCX unless the posting asks for PDF — it parses most
          reliably across ATS platforms.
        </p>
      )}

      {pending && (
        <p className="mt-3 text-[11px] font-medium text-muted-foreground">
          Opus is selecting and re-angling your strongest material for this JD,
          then auditing every claim against your masters — ~30–60s. The review
          studio opens when it&apos;s done.
        </p>
      )}

      {current?.tailoringNote && !pending && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] font-medium text-brand-600 dark:text-brand-400">
          <Sparkles size={12} className="mt-0.5 shrink-0" />
          {current.tailoringNote}
        </p>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 text-xs font-medium text-destructive">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {studio && studioId !== null && (
        <ResumeEditor
          doc={studio.doc}
          style={studio.style}
          audit={studio.audit}
          sourceText={studio.sourceText}
          jd={studio.jd}
          resumeId={studioId}
          onClose={() => setStudio(null)}
        />
      )}
    </section>
  );
}
