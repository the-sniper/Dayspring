"use client";

import { useRef, useState, useTransition } from "react";
import {
  FileDown,
  ClipboardPaste,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Check,
  ChevronRight
} from "lucide-react";
import {
  confirmImportAction,
  parseCsvAction,
  parsePasteAction,
  type ParseActionResult,
} from "@/lib/actions/imports";
import type { PreparedCandidate } from "@/lib/imports/candidates";
import { keyMessages } from "@/lib/keys/messages";
import type { JobSource } from "@/lib/types";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Preview = {
  candidates: PreparedCandidate[];
  warnings: string[];
  source: JobSource;
  checked: boolean[];
};

export default function ImportPanel({ hasKey }: { hasKey: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  function applyParse(res: ParseActionResult) {
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setResult(null);
    setPreview({
      candidates: res.candidates,
      warnings: res.warnings,
      source: res.source,
      checked: res.candidates.map((c) => !c.duplicate),
    });
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CSV bridge */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:border-brand-500/50">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
            <FileDown size={24} />
          </div>
          <h2 className="text-lg font-bold text-foreground">CSV Import</h2>
          <p className="mt-2 text-sm font-medium text-muted-foreground leading-relaxed">
            Upload exports from Simplify, JobRight, or MigrateMate. We'll automatically map company, title, and status.
          </p>
          
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(async () => applyParse(await parseCsvAction(fd)));
            }}
          >
            <div className="relative">
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                className="block w-full text-xs text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-xs file:font-bold file:text-foreground hover:file:bg-secondary/80 cursor-pointer"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
              {pending ? "Parsing…" : "Process CSV"}
            </button>
          </form>
        </div>

        {/* Paste bridge */}
        <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:border-brand-500/50">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
            <ClipboardPaste size={24} />
          </div>
          <h2 className="text-lg font-bold text-foreground">Smart Paste</h2>
          <p className="mt-2 text-sm font-medium text-muted-foreground leading-relaxed">
            Paste job digests or copied listings. Claude will extract structured records for you.
          </p>
          
          <div className="mt-6 space-y-4">
            <textarea
              ref={pasteRef}
              rows={3}
              placeholder="Paste content here…"
              className="w-full rounded-xl border border-border bg-secondary/30 p-3 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {!hasKey && (
              <div className="flex items-center gap-2 text-xs font-bold text-destructive">
                <AlertCircle size={14} />
                <span>{keyMessages.needsAnthropicShort}</span>
              </div>
            )}
            <button
              onClick={() => {
                const text = pasteRef.current?.value ?? "";
                startTransition(async () => applyParse(await parsePasteAction(text)));
              }}
              disabled={pending || !hasKey}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={18} strokeWidth={3} />}
              {pending ? "Extracting…" : "Extract with AI"}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive font-bold"
          >
            <AlertCircle size={18} />
            {error}
          </motion.div>
        )}
        
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-600 dark:text-emerald-400 font-bold"
          >
            <CheckCircle2 size={18} />
            {result}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="border-b border-border bg-secondary/30 px-6 py-4">
              <h2 className="text-lg font-bold text-foreground">
                Review Extraction
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  {preview.candidates.length} found · {preview.checked.filter(Boolean).length} selected
                </span>
              </h2>
              {preview.warnings.length > 0 && (
                <div className="mt-2 space-y-1">
                  {preview.warnings.map((w) => (
                    <div key={w} className="flex items-center gap-2 text-xs font-bold text-brand-600 dark:text-brand-400">
                      <AlertTriangle size={14} />
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <th className="px-6 py-3 w-10" />
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-6 py-3 text-right">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.candidates.map((c, i) => (
                    <tr key={i} className={cn("transition-colors", preview.checked[i] ? "bg-secondary/10" : "opacity-50")}>
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={preview.checked[i]}
                          onChange={(e) => {
                            const checked = [...preview.checked];
                            checked[i] = e.target.checked;
                            setPreview({ ...preview, checked });
                          }}
                          className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-4 font-bold text-foreground">{c.company}</td>
                      <td className="px-4 py-4 font-medium text-muted-foreground max-w-xs truncate">{c.title}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {c.status ?? "new"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground truncate max-w-[120px]">{c.location ?? "—"}</td>
                      <td className="px-6 py-4 text-right">
                        {c.duplicate && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                            Duplicate
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="border-t border-border bg-secondary/30 px-6 py-4">
              <button
                type="button"
                disabled={pending || preview.checked.every((c) => !c)}
                onClick={() =>
                  startTransition(async () => {
                    const selected = preview.candidates
                      .filter((_, i) => preview.checked[i])
                      .map(({ duplicate: _d, ...c }) => c);
                    const res = await confirmImportAction(selected, preview.source);
                    if (res.ok) {
                      setResult(
                        `Imported ${res.inserted} job${res.inserted === 1 ? "" : "s"}` +
                          (res.skipped ? `, ${res.skipped} skipped as duplicates.` : "."),
                      );
                      setPreview(null);
                    } else {
                      setError(res.error);
                    }
                  })
                }
                className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {pending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} strokeWidth={3} />}
                {pending ? "Importing…" : `Confirm Import (${preview.checked.filter(Boolean).length})`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
