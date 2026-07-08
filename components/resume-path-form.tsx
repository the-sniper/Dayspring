"use client";

import { useState, useTransition } from "react";
import { FileText, Check, Loader2 } from "lucide-react";
import { saveResumePathAction } from "@/lib/actions/settings";

export default function ResumePathForm({
  value,
  exists,
}: {
  value: string;
  exists: boolean;
}) {
  const [path, setPath] = useState(value);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <FileText size={14} className="text-muted-foreground" />
        <span className="text-xs font-bold text-foreground">Resume PDF</span>
        {value && (
          <span
            className={`text-[10px] font-bold uppercase tracking-widest ${exists ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}
          >
            {exists ? "found" : "path not found on disk"}
          </span>
        )}
      </div>
      <p className="mb-2 text-[11px] font-medium text-muted-foreground leading-relaxed">
        Absolute path to your resume PDF — apply-assist auto-uploads it.
      </p>
      <div className="flex gap-2">
        <input
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setSaved(false);
          }}
          placeholder="/Users/you/Documents/resume.pdf"
          className="flex-1 rounded-lg border border-border bg-secondary/20 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await saveResumePathAction(path);
              setSaved(true);
            })
          }
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {pending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saved ? (
            <Check size={16} />
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}
