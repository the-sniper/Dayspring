"use client";

// The resume studio — full-screen review & edit overlay shared by the per-job
// Resume Studio and the Resume Match tool. Nothing AI-generated should reach
// an application unreviewed: the preview highlights what the AI adjusted
// (green) and anything unsupported by your source resume (red), and every
// field is editable before download.
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Gauge,
  Sparkles,
  PencilRuler,
  Palette,
  FileDown,
  FileText,
  Save,
  Loader2,
  Shrink,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import type { ResumeDocType } from "@/lib/claude/resume";
import type { MatchAnalysis } from "@/lib/claude/resume-match";
import type { ResumeAudit } from "@/lib/resumes/audit-types";
import { buildHighlights } from "@/lib/resumes/audit-types";
import type { ResumeStyle } from "@/lib/resumes/style";
import { saveGeneratedResumeAction } from "@/lib/actions/resumes";
import { cn } from "@/lib/utils";
import ResumePreview, { countPdfPages, resumePdfBlob } from "./preview";
import { locateText } from "./doc-utils";
import AiTab from "./ai-tab";
import EditorTab from "./editor-tab";
import StyleTab from "./style-tab";

export type ResumeEditorProps = {
  doc: ResumeDocType;
  style: ResumeStyle;
  audit: ResumeAudit | null;
  sourceText: string;
  jd: string;
  // Present in the per-job context — enables Save (persist + re-render the
  // PDF apply-assist attaches). Match-tool sessions are transient: null.
  resumeId?: string | null;
  filename?: string;
  initialScore?: number | null;
  // Full analysis from the Match tool so the studio's Optimize tab shows the
  // score + "Raise your score" panel immediately (not only after a Rescore).
  initialAnalysis?: MatchAnalysis | null;
  onClose: () => void;
  onSaved?: () => void;
};

type Tab = "optimize" | "ask" | "editor" | "style";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function ResumeEditor(props: ResumeEditorProps) {
  const [doc, setDoc] = useState<ResumeDocType>(props.doc);
  const [style, setStyle] = useState<ResumeStyle>(props.style);
  const [audit, setAudit] = useState<ResumeAudit | null>(props.audit);
  const [tab, setTab] = useState<Tab>("optimize");
  const [showChanges, setShowChanges] = useState(true);
  const [pages, setPages] = useState(0);
  const [fitting, setFitting] = useState(false);
  const [fitNote, setFitNote] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [dirty, setDirty] = useState(false);

  const highlights = useMemo(() => buildHighlights(audit), [audit]);
  // Only count findings whose text is still in the doc — an edited or deleted
  // item is considered resolved.
  const counts = useMemo(() => {
    let adjusted = 0;
    let unsupported = 0;
    for (const f of audit?.findings ?? []) {
      if (f.status === "supported" || locateText(doc, f.text) === null) continue;
      if (f.status === "adjusted") adjusted++;
      else unsupported++;
    }
    return { adjusted, unsupported };
  }, [audit, doc]);

  // Lock body scroll while the studio is open; Esc closes.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(next: ResumeDocType) {
    setDoc(next);
    setDirty(true);
    setSaved(false);
  }
  function updateStyle(next: ResumeStyle) {
    setStyle(next);
    setDirty(true);
    setSaved(false);
    setFitNote(null);
  }

  const filename = (props.filename ?? doc.name.replace(/\s+/g, "-") ?? "resume")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 60) || "resume";

  async function downloadPdf() {
    setDownloading("pdf");
    try {
      download(await resumePdfBlob(doc, style), `${filename}.pdf`);
    } finally {
      setDownloading(null);
    }
  }

  async function downloadDocx() {
    setDownloading("docx");
    try {
      const res = await fetch("/api/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, style, filename }),
      });
      if (res.ok) download(await res.blob(), `${filename}.docx`);
    } finally {
      setDownloading(null);
    }
  }

  function save() {
    if (!props.resumeId) return;
    setSaveError(null);
    startSave(async () => {
      const res = await saveGeneratedResumeAction(props.resumeId!, doc, style);
      if (res.ok) {
        setSaved(true);
        setDirty(false);
        props.onSaved?.();
      } else {
        setSaveError(res.error);
      }
    });
  }

  // Step body size / spacing down until the render reports one page.
  async function fitToOnePage() {
    setFitting(true);
    setFitNote(null);
    try {
      let st = { ...style };
      let n = await countPdfPages(doc, st);
      let steps = 0;
      while (n > 1 && steps < 8) {
        st = {
          ...st,
          bodySize: Math.max(8, st.bodySize - 0.4),
          subHeaderSize: Math.max(8, st.subHeaderSize - 0.3),
          lineSpacing: Math.max(1.12, st.lineSpacing - 0.05),
          sectionSpacing: Math.max(5, st.sectionSpacing - 1),
          entrySpacing: Math.max(3, st.entrySpacing - 0.5),
          marginV: Math.max(0.35, st.marginV - 0.04),
          marginH: Math.max(0.4, st.marginH - 0.04),
        };
        n = await countPdfPages(doc, st);
        steps++;
      }
      if (n <= 1 && steps > 0) {
        updateStyle(st);
        setFitNote("Compacted to one page.");
      } else if (n > 1) {
        setFitNote("Still over one page — trim some bullets in the Editor tab.");
      } else {
        setFitNote("Already one page.");
      }
    } finally {
      setFitting(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Gauge }[] = [
    { id: "optimize", label: "Optimize", icon: Gauge },
    { id: "ask", label: "Ask AI", icon: Sparkles },
    { id: "editor", label: "Editor", icon: PencilRuler },
    { id: "style", label: "Style", icon: Palette },
  ];

  const body = (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate font-display text-base font-semibold text-foreground">
            Review &amp; edit — {doc.name}
          </h2>
          {audit && (
            <div className="hidden items-center gap-1.5 md:flex">
              {counts.adjusted > 0 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  {counts.adjusted} adjusted
                </span>
              )}
              {counts.unsupported > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                  {counts.unsupported} to verify
                </span>
              )}
              {counts.adjusted === 0 && counts.unsupported === 0 && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                  fully supported
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowChanges((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors cursor-pointer",
              showChanges
                ? "border-brand-500/40 bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-400"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            title="Highlight AI-adjusted (green) and unsupported (red) content in the preview"
          >
            {showChanges ? <Eye size={13} /> : <EyeOff size={13} />}
            Show changes
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* ── Body: preview left, panel right ─────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <div className="hidden min-w-0 flex-1 lg:block">
          <ResumePreview
            doc={doc}
            style={style}
            highlights={highlights}
            showChanges={showChanges}
            onPagesChange={setPages}
          />
        </div>

        <div className="flex w-full flex-col border-l border-border bg-card lg:w-[480px] lg:shrink-0">
          <div className="flex shrink-0 border-b border-border">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-bold transition-colors cursor-pointer",
                    active
                      ? "border-brand-500 text-brand-600 dark:text-brand-400"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={14} />
                  {t.label}
                  {t.id === "optimize" && counts.unsupported > 0 && (
                    <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                      {counts.unsupported}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Optimize and Ask AI are the SAME AiTab instance at the same JSX
                position, so React preserves the score/audit/added-skill state
                when switching between them — only the `view` prop changes. */}
            {(tab === "optimize" || tab === "ask") && (
              <AiTab
                view={tab === "ask" ? "ask" : "optimize"}
                doc={doc}
                audit={audit}
                jd={props.jd}
                sourceText={props.sourceText}
                initialScore={props.initialScore ?? null}
                initialAnalysis={props.initialAnalysis ?? null}
                onDoc={update}
                onAudit={setAudit}
              />
            )}
            {tab === "editor" && (
              <EditorTab doc={doc} style={style} onDoc={update} onStyle={updateStyle} />
            )}
            {tab === "style" && <StyleTab style={style} onStyle={updateStyle} />}
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-[11px] font-bold",
              pages > 1 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {pages > 0 ? `${pages} page${pages === 1 ? "" : "s"}` : "…"}
          </span>
          <button
            type="button"
            disabled={fitting}
            onClick={fitToOnePage}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground transition-colors hover:border-brand-500/40 hover:text-brand-600 disabled:opacity-50 cursor-pointer"
          >
            {fitting ? <Loader2 size={13} className="animate-spin" /> : <Shrink size={13} />}
            Fit to one page
          </button>
          {fitNote && (
            <span className="text-[11px] font-medium text-muted-foreground">{fitNote}</span>
          )}
          {saveError && (
            <span className="text-[11px] font-medium text-destructive">{saveError}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={downloading !== null}
            onClick={downloadPdf}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground transition-all hover:border-brand-500/40 hover:text-brand-600 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {downloading === "pdf" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileText size={14} />
            )}
            Download PDF
          </button>
          <button
            type="button"
            disabled={downloading !== null}
            onClick={downloadDocx}
            title="DOCX parses most reliably across ATS platforms — submit it unless the posting asks for PDF"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground transition-all hover:border-brand-500/40 hover:text-brand-600 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {downloading === "docx" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileDown size={14} />
            )}
            DOCX
          </button>
          {props.resumeId != null && (
            <button
              type="button"
              disabled={saving || (!dirty && saved)}
              onClick={save}
              className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : saved && !dirty ? (
                <Check size={14} />
              ) : (
                <Save size={14} />
              )}
              {saving ? "Saving…" : saved && !dirty ? "Saved" : "Save"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );

  return createPortal(body, document.body);
}
