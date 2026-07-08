"use client";

import { useState, useTransition } from "react";
import {
  Users2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Check,
} from "lucide-react";
import {
  confirmLinkedinAction,
  parseLinkedinAction,
  type LinkedinParseActionResult,
} from "@/lib/actions/linkedin-import";
import type { PreparedLinkedin } from "@/lib/imports/linkedin";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Preview = {
  candidates: PreparedLinkedin[];
  warnings: string[];
  checked: boolean[];
};

export default function LinkedinImportPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyParse(res: LinkedinParseActionResult) {
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setResult(null);
    setPreview({
      candidates: res.candidates,
      warnings: res.warnings,
      checked: res.candidates.map((c) => !c.duplicate),
    });
  }

  const selectedCount = preview?.checked.filter(Boolean).length ?? 0;

  return (
    <div className="space-y-8">
      <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:border-brand-500/50">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400">
          <Users2 size={24} />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          LinkedIn Connections
        </h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-muted-foreground leading-relaxed">
          Import your exported{" "}
          <code className="text-brand-600">Connections.csv</code> to seed your
          warm network — the free counterpart to Happenstance search. Export it
          from{" "}
          <span className="font-semibold">
            LinkedIn → Settings → Data Privacy → Get a copy of your data →
            Connections
          </span>
          . Contacts are matched to companies you already track; the rest come
          in unattached.
        </p>

        <form
          className="mt-6 flex flex-wrap items-center gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => applyParse(await parseLinkedinAction(fd)));
          }}
        >
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="block flex-1 min-w-[200px] text-xs text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-xs file:font-bold file:text-foreground hover:file:bg-secondary/80 cursor-pointer"
          />
          <button
            type="submit"
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {pending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} strokeWidth={3} />
            )}
            {pending ? "Reading…" : "Preview"}
          </button>
        </form>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive"
          >
            <AlertCircle size={18} />
            {error}
          </motion.div>
        )}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm font-bold text-emerald-600 dark:text-emerald-400"
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
                Review Connections
                <span className="ml-2 text-xs font-medium text-muted-foreground">
                  {preview.candidates.length} found · {selectedCount} selected
                </span>
              </h2>
              {preview.warnings.length > 0 && (
                <div className="mt-2 space-y-1">
                  {preview.warnings.map((w) => (
                    <div
                      key={w}
                      className="flex items-center gap-2 text-xs font-bold text-brand-600 dark:text-brand-400"
                    >
                      <AlertTriangle size={14} />
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <th className="px-6 py-3 w-10" />
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role @ Company</th>
                    <th className="px-6 py-3 text-right">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.candidates.map((c, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "transition-colors",
                        preview.checked[i] ? "bg-secondary/10" : "opacity-50",
                      )}
                    >
                      <td className="px-6 py-3">
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
                      <td className="px-4 py-3 font-bold text-foreground whitespace-nowrap">
                        {c.name}
                      </td>
                      <td className="px-4 py-3 font-medium text-muted-foreground max-w-md truncate">
                        {[c.title, c.companyName].filter(Boolean).join(" @ ") || "—"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {c.duplicate && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                            Already saved
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
                disabled={pending || selectedCount === 0}
                onClick={() =>
                  startTransition(async () => {
                    const selected = preview.candidates
                      .filter((_, i) => preview.checked[i])
                      .map(({ duplicate: _d, ...c }) => c);
                    const res = await confirmLinkedinAction(selected);
                    if (res.ok) {
                      setResult(
                        `Imported ${res.inserted} contact${res.inserted === 1 ? "" : "s"}` +
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
                {pending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} strokeWidth={3} />
                )}
                {pending ? "Importing…" : `Import ${selectedCount} to contacts`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
