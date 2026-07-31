"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, Check, Trash2, AlertCircle } from "lucide-react";
import { clearKeyAction, saveKeyAction } from "@/lib/actions/keys";
import { cn } from "@/lib/utils";

export type KeyRowView = {
  name: string;
  label: string;
  purpose: string;
  source: "env" | "saved" | null;
  // A stored value can exist even when env overrides it — the trash button
  // keys off this so a masked key is still clearable.
  hasSaved: boolean;
  getUrl: string | null;
};

// Per-user keys — stored AES-encrypted in your Convex account. Each user
// brings their own; nothing is pre-filled from server environment variables.
export default function ApiKeysPanel({ keys }: { keys: KeyRowView[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
          <KeyRound size={22} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">API Keys</h2>
          <p className="text-xs font-medium text-muted-foreground">
            Paste your own keys — stored encrypted in your account.
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {keys.map((k) => (
          <KeyRow key={k.name} row={k} />
        ))}
      </div>
    </section>
  );
}

function KeyRow({ row }: { row: KeyRowView }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState(row.source);
  const [saved, setSaved] = useState(row.hasSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!value.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await saveKeyAction(row.name, value);
      if (res.ok) {
        setStatus("saved");
        setSaved(true);
        setValue("");
      } else setError(res.error);
    });
  }

  function clear() {
    setError(null);
    startTransition(async () => {
      const res = await clearKeyAction(row.name);
      if (res.ok) {
        setStatus(null);
        setSaved(false);
      } else setError(res.error);
    });
  }

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-foreground">{row.label}</p>
            {status === "env" && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-muted-foreground" title="Loaded from your machine's .env.local for local CLI scripts (optional)">
                env
              </span>
            )}
            {status === "saved" && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                saved
              </span>
            )}
            {!status && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
                missing
              </span>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted-foreground">
            {row.purpose}
            {row.getUrl && !status && (
              <>
                {" · "}
                <a href={row.getUrl} target="_blank" rel="noreferrer" className="font-bold text-brand-600 hover:underline">
                  get one
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={status ? "Replace…" : "Paste key…"}
          autoComplete="off"
          className="flex-1 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm font-mono transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:font-sans placeholder:text-muted-foreground/50"
        />
        <button
          type="button"
          disabled={pending || !value.trim()}
          onClick={save}
          className={cn(
            "flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-all active:scale-95 disabled:opacity-40 cursor-pointer",
          )}
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3} />}
          Save
        </button>
        {saved && (
          <button
            type="button"
            disabled={pending}
            title="Remove the saved key"
            onClick={clear}
            className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-destructive">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
