"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileCode2,
  Loader2,
  Terminal,
  Upload,
} from "lucide-react";
import {
  getResumeAssetAction,
  saveResumeAssetAction,
  setDefaultLengthModeAction,
  uploadResumeAssetAction,
} from "@/lib/actions/latex-resume";
import { cn } from "@/lib/utils";

// The two inputs to the LaTeX tailoring path. Both are plain text you can
// upload OR paste, because the knowledge base is a living document you'll edit
// far more often than you'll re-upload it, and round-tripping through a file
// every time you fix one flagged metric is friction for no reason.

export type AssetSummaryRow = {
  kind: string;
  label: string | null;
  chars: number;
  updatedAt: string;
};

type Msg = { kind: "ok" | "err"; text: string } | null;

const KINDS = {
  latex_template: {
    title: "LaTeX template",
    icon: FileCode2,
    accept: ".tex,.txt",
    blurb:
      "Your own .tex resume. Tailoring rewrites its content and keeps its document class, packages and typography, so the output looks like your resume rather than a generated one.",
    placeholder: "\\documentclass[11pt]{article}\n…",
  },
  knowledge_base: {
    title: "Master Knowledge Base",
    icon: BookOpen,
    accept: ".md,.txt,.markdown",
    blurb:
      "The source of truth: full work history, projects with verified numbers, the skills inventory, and the flags for anything unverified. Tailoring reads this first — it holds far more vetted material than any single resume version shows.",
    placeholder: "# Master Resume Knowledge Base\n\n## 1. Identity…",
  },
} as const;

type Kind = keyof typeof KINDS;

function AssetEditor({
  kind,
  summary,
  onSaved,
}: {
  kind: Kind;
  summary: AssetSummaryRow | undefined;
  onSaved: () => void;
}) {
  const meta = KINDS[kind];
  const Icon = meta.icon;
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();

  const has = !!summary;

  function upload(file: File) {
    setMsg(null);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    start(async () => {
      const res = await uploadResumeAssetAction(fd);
      setMsg(
        res.ok
          ? { kind: "ok", text: `Saved ${(res.chars / 1000).toFixed(1)}k characters.` }
          : { kind: "err", text: res.error },
      );
      if (fileRef.current) fileRef.current.value = "";
      if (res.ok) onSaved();
    });
  }

  function openEditor() {
    setMsg(null);
    start(async () => {
      const res = await getResumeAssetAction(kind);
      setDraft(res.ok ? res.content : "");
      setOpen(true);
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveResumeAssetAction(kind, draft, summary?.label ?? undefined);
      if (res.ok) {
        setMsg({ kind: "ok", text: `Saved ${(res.chars / 1000).toFixed(1)}k characters.` });
        setOpen(false);
        onSaved();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon size={16} className="text-brand-500" />
        <h3 className="text-sm font-bold text-foreground">{meta.title}</h3>
        {has ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={11} />
            {(summary.chars / 1000).toFixed(1)}k chars
          </span>
        ) : (
          <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            not set
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground disabled:opacity-50"
          >
            <Upload size={12} />
            Upload
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => (open ? setOpen(false) : openEditor())}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground disabled:opacity-50"
          >
            {open ? "Close" : has ? "View & edit" : "Paste"}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={meta.accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
      </div>

      <p className="mt-2 text-xs font-medium leading-relaxed text-muted-foreground">
        {meta.blurb}
      </p>
      {has && summary.label && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {summary.label} · updated {summary.updatedAt.slice(0, 10)}
        </p>
      )}

      {open && (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            rows={16}
            placeholder={meta.placeholder}
            className="w-full rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground outline-none focus:border-brand-500"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-[var(--radius)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-foreground)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <span className="text-[11px] text-muted-foreground">
              {(draft.length / 1000).toFixed(1)}k characters
            </span>
          </div>
        </div>
      )}

      {msg && (
        <p
          className={cn(
            "mt-2 flex items-start gap-1.5 text-xs font-medium",
            msg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
          )}
        >
          {msg.kind === "ok" ? (
            <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
          )}
          {msg.text}
        </p>
      )}
      {busy && !open && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin" />
          Working…
        </p>
      )}
    </div>
  );
}

export default function ResumeSourcesPanel({
  assets,
  backend,
  serviceUrl,
  engine,
  engineBin,
  searched,
  hosted,
  defaultLengthMode,
}: {
  assets: AssetSummaryRow[];
  backend: "service" | "local" | "none";
  serviceUrl: string | null;
  engine: string | null;
  engineBin: string | null;
  searched: string[];
  hosted: boolean;
  defaultLengthMode: "one_page" | "two_page";
}) {
  const [rows, setRows] = useState(assets);
  const [mode, setMode] = useState(defaultLengthMode);
  const [, start] = useTransition();
  const byKind = (k: string) => rows.find((r) => r.kind === k);

  // The server action revalidates, but the panel is client-side and the user is
  // usually mid-flow (paste one, then the other) — bump the local row so the
  // "not set" badge flips immediately instead of after a navigation.
  const markSaved = (kind: string) =>
    setRows((prev) =>
      prev.some((r) => r.kind === kind)
        ? prev
        : [...prev, { kind, label: null, chars: 1, updatedAt: new Date().toISOString() }],
    );

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
          <FileCode2 size={22} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Resume sources (LaTeX)</h2>
          <p className="text-xs font-medium text-muted-foreground">
            The hiring-manager tailoring path — rewrites your .tex against each JD.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <AssetEditor
          kind="latex_template"
          summary={byKind("latex_template")}
          onSaved={() => markSaved("latex_template")}
        />
        <AssetEditor
          kind="knowledge_base"
          summary={byKind("knowledge_base")}
          onSaved={() => markSaved("knowledge_base")}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Default length
        </span>
        <div className="flex rounded-lg border border-border p-0.5">
          {(["one_page", "two_page"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                start(async () => {
                  await setDefaultLengthModeAction(m);
                });
              }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                mode === m
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "one_page" ? "1 page" : "2 pages"}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          Overridable per job when you generate.
        </span>
      </div>

      {/* The engine is a property of the machine running Dayspring, so it can't
          be fixed from inside the app. "Not found" has two very different
          causes — nothing installed, vs installed somewhere this process's PATH
          can't see — so show where we looked rather than just reporting a miss. */}
      <div className="mt-3 text-xs font-medium">
        <div className="flex flex-wrap items-start gap-2">
          <Terminal size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
          {engine ? (
            <span className="text-muted-foreground">
              LaTeX engine: <span className="text-foreground">{engine}</span>
              {engineBin && engineBin !== engine && (
                <span className="text-muted-foreground/70"> ({engineBin})</span>
              )}{" "}
              — tailored resumes compile to PDF here.
            </span>
          ) : hosted ? (
            /* Hosted: nobody here can install anything, so this is a statement
               of fact plus the workaround, not a to-do list. */
            <span className="text-muted-foreground">
              PDF rendering isn&apos;t configured on this deployment. Tailoring
              still works — download the .tex and compile it in Overleaf for the
              PDF.
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              No LaTeX backend configured. The .tex still generates and downloads,
              it just won&apos;t render to PDF — and without a page count the
              length check can&apos;t run.
            </span>
          )}
        </div>

        {backend === "service" && (
          <p className="mt-1 pl-5 text-[11px] text-muted-foreground/70">
            Compiling via the sidecar at {serviceUrl}. Nothing to install here or
            on any user&apos;s machine.
          </p>
        )}

        {backend === "none" && !hosted && (
          <div className="mt-2 space-y-1.5 pl-5 text-[11px] leading-relaxed text-muted-foreground">
            {/* Sidecar first: it's the answer that also works for users, on a
                hosted deployment, and on a machine that will never have TeX. A
                local install only ever fixes this one laptop. */}
            <p>
              <span className="text-foreground">Recommended:</span> deploy the
              compile sidecar in <code>services/latex</code> (
              <code>fly launch</code>, one command) and set{" "}
              <code className="text-foreground">DAYSPRING_LATEX_SERVICE_URL</code>{" "}
              plus{" "}
              <code className="text-foreground">DAYSPRING_LATEX_SERVICE_SECRET</code>
              . Then nothing needs installing here or for any user.
            </p>
            <p>
              Or, for this machine only:{" "}
              <code className="text-foreground">brew install tectonic</code>, then
              reload — no restart needed. Searched{" "}
              <code className="text-muted-foreground/80">{searched.join(", ")}</code>
              . If you have TeX installed somewhere else, point{" "}
              <code className="text-foreground">DAYSPRING_TEX_ENGINE</code> at the
              binary.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
