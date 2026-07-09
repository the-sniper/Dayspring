"use client";

import { useRef, useState, useTransition } from "react";
import {
  FileText,
  Upload,
  Loader2,
  Star,
  Trash2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Eye,
  Check,
  X,
} from "lucide-react";
import {
  deleteMasterResumeAction,
  reparseMasterAction,
  setPrimaryMasterAction,
  updateMasterContentAction,
  uploadMasterResumeAction,
} from "@/lib/actions/resumes";
import { cn } from "@/lib/utils";

type MasterView = {
  id: number;
  label: string;
  content: string;
  isPrimary: boolean;
  isPdf: boolean;
  updatedAt: string;
};

type ParseInfo = { faithful: boolean; problems: string[]; passes: number } | null;

function parseSummary(parse: ParseInfo): { ok: boolean; text: string } | null {
  if (!parse) return null;
  if (parse.faithful) {
    return {
      ok: true,
      text: `verified against the PDF — no discrepancies${parse.passes > 1 ? " (after one repair round)" : ""}`,
    };
  }
  const shown = parse.problems.slice(0, 3).join(" · ");
  return {
    ok: false,
    text: `parsed with ${parse.problems.length} outstanding note${parse.problems.length === 1 ? "" : "s"}: ${shown}${
      parse.problems.length > 3 ? " …" : ""
    } — open View & edit to fix.`,
  };
}

// Master resume corpus — the ground truth every per-JD tailored resume is
// generated from. PDF parsing is the verified pipeline: an Opus transcription
// with extended thinking, audited fact-by-fact against the PDF, repaired once
// if anything was lost, and always human-editable (View & edit).
export default function MasterResumesPanel({
  masters,
  hasApiKey,
}: {
  masters: MasterView[];
  hasApiKey: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  function upload(file: File) {
    setMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    startUpload(async () => {
      const res = await uploadMasterResumeAction(fd);
      if (res.ok) {
        const quality = parseSummary(res.parse);
        setMsg({
          kind: quality && !quality.ok ? "warn" : "ok",
          text: `Imported “${res.label}” (${Math.round(res.chars / 100) / 10}k chars)${
            quality ? ` — ${quality.text}` : ""
          }${
            res.seededProfile
              ? " Your scoring profile was seeded from it — add role/location/visa preferences in the profile box above."
              : ""
          }`,
        });
      } else {
        setMsg({ kind: "err", text: res.error });
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
          <FileText size={22} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Master Resumes</h2>
          <p className="text-xs font-medium text-muted-foreground">
            The source of truth tailored resumes are generated from.
          </p>
        </div>
      </div>

      <p className="mb-4 text-xs font-medium text-muted-foreground leading-relaxed">
        Add one or more resumes (.pdf, .md, .txt), one at a time. Per-job
        generation picks the most relevant truthful content across{" "}
        <em>all</em> of them — it never invents anything that isn&apos;t here.
        PDF parsing transcribes with Opus, then{" "}
        <span className="font-bold text-foreground">audits itself against the
        PDF</span> and repairs anything lost (~30–90s). You can re-parse or
        hand-edit any of them below.
      </p>

      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.md,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} strokeWidth={2.5} />}
          {uploading
            ? "Parsing & verifying…"
            : masters.length > 0
              ? "Add another resume"
              : "Upload master resume"}
        </button>
        {!hasApiKey && (
          <p className="text-[11px] font-medium text-muted-foreground">
            PDFs need your Anthropic key (API Keys) — .md/.txt work without.
          </p>
        )}
      </div>

      {msg && (
        <p
          className={cn(
            "mt-3 flex items-start gap-2 text-xs font-medium",
            msg.kind === "ok" && "text-emerald-600 dark:text-emerald-400",
            msg.kind === "warn" && "text-amber-600 dark:text-amber-400",
            msg.kind === "err" && "text-destructive",
          )}
        >
          {msg.kind === "ok" ? (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
          )}
          {msg.text}
        </p>
      )}

      {masters.length > 0 && (
        <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-secondary/10 overflow-hidden">
          {masters.map((m) => (
            <MasterRow key={m.id} m={m} hasApiKey={hasApiKey} />
          ))}
        </div>
      )}
    </section>
  );
}

function MasterRow({ m, hasApiKey }: { m: MasterView; hasApiKey: boolean }) {
  const [content, setContent] = useState(m.content);
  const [draft, setDraft] = useState(m.content);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [reparsing, startReparse] = useTransition();
  const [saving, startSave] = useTransition();
  const [rowBusy, startRow] = useTransition();

  const iconBtn =
    "p-1.5 rounded-lg bg-card border border-border text-muted-foreground transition-colors cursor-pointer disabled:opacity-40";

  function reparse() {
    setNote(null);
    startReparse(async () => {
      const res = await reparseMasterAction(m.id);
      if (res.ok) {
        setContent(res.content);
        setDraft(res.content);
        setNote(parseSummary(res.parse));
      } else {
        setNote({ ok: false, text: res.error });
      }
    });
  }

  function saveEdit() {
    setNote(null);
    startSave(async () => {
      const res = await updateMasterContentAction(m.id, draft);
      if (res.ok) {
        setContent(draft.trim());
        setOpen(false);
        setNote({ ok: true, text: "saved your edits — this is now the exact source of truth." });
      } else {
        setNote({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-foreground">{m.label}</p>
            {m.isPrimary && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                Primary
              </span>
            )}
            {m.isPdf && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-muted-foreground">
                PDF
              </span>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground">
            {Math.round(content.length / 100) / 10}k chars · updated {m.updatedAt.slice(0, 10)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            title={open ? "Close" : "View & edit the parsed content"}
            onClick={() => {
              setDraft(content);
              setOpen(!open);
            }}
            className={cn(iconBtn, "hover:text-brand-600", open && "text-brand-600 border-brand-500/40")}
          >
            {open ? <X size={14} /> : <Eye size={14} />}
          </button>
          {m.isPdf && (
            <button
              type="button"
              title="Re-parse from the original PDF (Opus, verified — ~30–90s)"
              disabled={reparsing || !hasApiKey}
              onClick={reparse}
              className={cn(iconBtn, "hover:text-brand-600")}
            >
              {reparsing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          )}
          {!m.isPrimary && (
            <button
              type="button"
              title="Make primary"
              disabled={rowBusy}
              onClick={() =>
                startRow(async () => {
                  await setPrimaryMasterAction(m.id);
                })
              }
              className={cn(iconBtn, "hover:text-amber-500")}
            >
              {rowBusy ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
            </button>
          )}
          <button
            type="button"
            title="Remove"
            disabled={rowBusy}
            onClick={() => {
              if (!confirm(`Remove master resume “${m.label}”?`)) return;
              startRow(async () => {
                await deleteMasterResumeAction(m.id);
              });
            }}
            className={cn(iconBtn, "hover:text-destructive")}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {reparsing && (
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">
          Re-parsing: Opus transcribes, audits itself against the PDF, and repairs
          anything lost…
        </p>
      )}

      {note && !reparsing && (
        <p
          className={cn(
            "mt-2 flex items-start gap-1.5 text-[11px] font-medium",
            note.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
          )}
        >
          {note.ok ? (
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
          )}
          {note.text}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            spellCheck={false}
            className="w-full rounded-xl border border-border bg-secondary/20 p-3 font-mono text-[11px] leading-relaxed transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving || draft.trim() === content.trim()}
              onClick={saveEdit}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
              Save edits
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(content);
                setOpen(false);
              }}
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground cursor-pointer"
            >
              Cancel
            </button>
            <p className="text-[10px] font-medium text-muted-foreground">
              Every fact here is what tailoring is allowed to use — fix anything
              the parse got wrong.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
