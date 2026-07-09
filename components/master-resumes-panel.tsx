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
} from "lucide-react";
import {
  deleteMasterResumeAction,
  setPrimaryMasterAction,
  uploadMasterResumeAction,
} from "@/lib/actions/resumes";
import { cn } from "@/lib/utils";

type MasterView = {
  id: number;
  label: string;
  chars: number;
  isPrimary: boolean;
  isPdf: boolean;
  updatedAt: string;
};

// Master resume corpus — the ground truth every per-JD tailored resume is
// generated from. Upload one or several (e.g. a SWE-angled and a data-angled
// version); generation selects the strongest truthful content across all.
export default function MasterResumesPanel({
  masters,
  hasApiKey,
}: {
  masters: MasterView[];
  hasApiKey: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingRow, startRow] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function upload(file: File) {
    setMsg(null);
    const fd = new FormData();
    fd.set("file", file);
    startUpload(async () => {
      const res = await uploadMasterResumeAction(fd);
      if (res.ok) {
        setMsg({
          kind: "ok",
          text: `Imported “${res.label}” (${Math.round(res.chars / 100) / 10}k chars).${
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
        Upload one or more resumes (.pdf, .md, .txt). Per-job generation picks the
        most relevant truthful content across <em>all</em> of them — it never
        invents anything that isn&apos;t here. The ⭐ primary&apos;s PDF is also the
        fallback attachment when a job has no tailored resume yet.
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
          {uploading ? "Reading…" : "Upload master resume"}
        </button>
        {!hasApiKey && (
          <p className="text-[11px] font-medium text-muted-foreground">
            PDFs need ANTHROPIC_API_KEY (transcription) — .md/.txt work without.
          </p>
        )}
      </div>

      {msg && (
        <p
          className={cn(
            "mt-3 flex items-start gap-2 text-xs font-medium",
            msg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
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
            <div key={m.id} className="flex items-center justify-between gap-3 p-3.5">
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
                  {Math.round(m.chars / 100) / 10}k chars · added {m.updatedAt.slice(0, 10)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!m.isPrimary && (
                  <button
                    type="button"
                    title="Make primary"
                    disabled={pendingRow && busyId === m.id}
                    onClick={() => {
                      setBusyId(m.id);
                      startRow(async () => {
                        await setPrimaryMasterAction(m.id);
                      });
                    }}
                    className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-amber-500 transition-colors cursor-pointer"
                  >
                    {pendingRow && busyId === m.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Star size={14} />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  title="Remove"
                  disabled={pendingRow && busyId === m.id}
                  onClick={() => {
                    if (!confirm(`Remove master resume “${m.label}”?`)) return;
                    setBusyId(m.id);
                    startRow(async () => {
                      await deleteMasterResumeAction(m.id);
                    });
                  }}
                  className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
