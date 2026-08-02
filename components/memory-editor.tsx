"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import {
  saveMemoryDataAction,
  type OrchestraActionResult,
} from "@/lib/actions/orchestra";
import type {
  BannedTopicsData,
  BrandVoiceData,
  LessonsData,
  ProjectRef,
} from "@/lib/orchestra/memory";
import { fmtDate } from "@/lib/orchestra/format";
import { displayName } from "@/lib/orchestra/registry";
import { cn } from "@/lib/utils";

// Structured memory editor: chips, tag lists, and per-item rows instead of
// one big textarea. Each card saves independently.

const TONE_SUGGESTIONS = [
  "Direct",
  "Technical",
  "First-person",
  "Build-in-public",
  "Casual",
  "Story-driven",
  "Witty",
  "Opinionated",
];

function Chip({
  text,
  active,
  onClick,
  onRemove,
}: {
  text: string;
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-tight transition-all duration-300",
        onClick && "cursor-pointer active:scale-95",
        active
          ? "border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400 shadow-[0_4px_12px_-4px_rgba(245,158,11,0.4)]"
          : "border-border bg-secondary/20 text-muted-foreground hover:border-brand-500/40 hover:bg-secondary/40",
      )}
    >
      {text}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 text-muted-foreground/40 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

function AddInput({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (v: string) => void;
}) {
  const [v, setV] = useState("");
  function commit() {
    if (v.trim().length < 2) return;
    onAdd(v.trim());
    setV("");
  }
  return (
    <div className="flex items-center gap-2 group/input">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-xl border border-border/80 bg-background/50 backdrop-blur-sm px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 transition-all focus:border-brand-500/60 focus:bg-background focus:outline-none focus:ring-4 focus:ring-brand-500/5"
      />
      <button
        type="button"
        onClick={commit}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-background/50 text-muted-foreground/60 transition-all hover:bg-brand-500/10 hover:text-brand-600 hover:border-brand-500/30 active:scale-90"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function ProjectAdd({ onAdd }: { onAdd: (pr: ProjectRef) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  function commit() {
    if (name.trim().length < 2) return;
    const u = url.trim();
    onAdd({
      name: name.trim(),
      url: u && !/^https?:\/\//.test(u) ? `https://${u}` : u,
    });
    setName("");
    setUrl("");
  }
  return (
    <div className="mt-2 grid grid-cols-[1fr,2fr,auto] gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="min-w-0 rounded-xl border border-border/80 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-brand-500/60 focus:bg-background focus:outline-none focus:ring-4 focus:ring-brand-500/5"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
        placeholder="Evidence URL"
        className="min-w-0 rounded-xl border border-border/80 bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-brand-500/60 focus:bg-background focus:outline-none focus:ring-4 focus:ring-brand-500/5"
      />
      <button
        type="button"
        onClick={commit}
        className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/80 bg-background/50 text-muted-foreground/60 transition-all hover:bg-brand-500/10 hover:text-brand-600 hover:border-brand-500/30 active:scale-90"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function ItemList({
  items,
  onRemove,
  danger,
}: {
  items: string[];
  onRemove: (i: number) => void;
  danger?: boolean;
}) {
  if (!items.length)
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-secondary/5 px-4 py-3 text-center">
        <p className="text-[11px] font-medium text-muted-foreground/40 italic">No entries yet</p>
      </div>
    );
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <li
          key={`${i}-${it.slice(0, 20)}`}
          className="group flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-secondary/10 px-3 py-2.5 transition-all hover:border-brand-500/20 hover:bg-secondary/20"
        >
          <span className="text-[12px] font-medium leading-relaxed text-foreground/90">{it}</span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className={cn(
              "mt-0.5 shrink-0 rounded-lg p-1 text-muted-foreground/20 transition-all opacity-0 group-hover:opacity-100 group-hover:text-muted-foreground/60",
              danger ? "hover:bg-rose-500/10 hover:text-rose-500" : "hover:bg-secondary/80 hover:text-foreground",
            )}
          >
            <X size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function CardShell({
  title,
  hint,
  dirty,
  saving,
  onSave,
  result,
  children,
}: {
  title: string;
  hint: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  result: OrchestraActionResult | null;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "group flex flex-col gap-6 rounded-[2rem] border bg-card p-6 shadow-xl transition-all duration-500",
      dirty ? "border-brand-500/40 shadow-brand-500/5" : "border-border/80"
    )}>
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <h3 className="font-display text-base font-bold tracking-tight text-foreground">
          {title}
        </h3>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={onSave}
          className={cn(
            "relative flex items-center gap-2 rounded-xl px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all",
            dirty
              ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25 hover:scale-[1.02] hover:brightness-105 active:scale-95"
              : "bg-secondary/50 text-muted-foreground/40 grayscale pointer-events-none",
          )}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {dirty ? "Deploy Memory" : "Memory Synced"}
        </button>
      </div>
      
      <div className="flex flex-col gap-6">
        {children}
      </div>

      <div className="mt-auto pt-6 border-t border-border/40">
        <p className="text-[10px] font-semibold leading-relaxed text-muted-foreground/40 italic">
          {hint}
        </p>
        {result && !result.ok && (
          <p className="mt-2 text-[10px] font-bold text-rose-500 uppercase tracking-wider">{result.message}</p>
        )}
      </div>
    </div>
  );
}

function useSave(key: string) {
  const [saving, startTransition] = useTransition();
  const [result, setResult] = useState<OrchestraActionResult | null>(null);
  const [dirty, setDirty] = useState(false);
  function save(value: unknown) {
    startTransition(async () => {
      const r = await saveMemoryDataAction(key, JSON.stringify(value));
      setResult(r);
      if (r.ok) setDirty(false);
    });
  }
  return { saving, result, dirty, setDirty, save };
}

export default function MemoryEditor({
  voice: voiceInit,
  banned: bannedInit,
  lessons: lessonsInit,
}: {
  voice: BrandVoiceData;
  banned: BannedTopicsData;
  lessons: LessonsData;
}) {
  // ---- Brand voice ----
  const [voice, setVoice] = useState(voiceInit);
  const vs = useSave("brandVoice");
  const editVoice = (patch: Partial<BrandVoiceData>) => {
    setVoice((v) => ({ ...v, ...patch }));
    vs.setDirty(true);
  };
  const toneOptions = [
    ...TONE_SUGGESTIONS,
    ...voice.tones.filter((t) => !TONE_SUGGESTIONS.includes(t)),
  ];

  // ---- Banned topics ----
  const [banned, setBanned] = useState(bannedInit);
  const bs = useSave("bannedTopics");

  // ---- Lessons ----
  const [lessons, setLessons] = useState(lessonsInit);
  const ls = useSave("lessons");

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <CardShell
          title="Brand voice"
          hint="Quill writes from this. The sample posts matter most — paste 3-5 fragments that sound like you."
          dirty={vs.dirty}
          saving={vs.saving}
          onSave={() => vs.save(voice)}
          result={vs.result}
        >
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
              Tone Alignment
            </p>
            <div className="flex flex-wrap gap-2">
              {toneOptions.map((t) => (
                <Chip
                  key={t}
                  text={t}
                  active={voice.tones.includes(t)}
                  onClick={() =>
                    editVoice({
                      tones: voice.tones.includes(t)
                        ? voice.tones.filter((x) => x !== t)
                        : [...voice.tones, t],
                    })
                  }
                />
              ))}
            </div>
            <div className="mt-3">
              <AddInput
                placeholder="Inject custom tone…"
                onAdd={(v) => editVoice({ tones: [...voice.tones, v] })}
              />
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                Reference Projects
              </p>
              <div className="flex flex-col gap-2">
                {voice.projects.map((pr, i) => (
                  <div
                    key={`${pr.name}-${i}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-secondary/10 px-3 py-2.5 transition-all hover:border-brand-500/20 hover:bg-secondary/20"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold tracking-tight text-foreground">
                          {pr.name}
                        </span>
                        {pr.verifiedAt ? (
                          <span className="rounded-full bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Verified
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500/5 border border-amber-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            {pr.url ? "Pending" : "Ghost"}
                          </span>
                        )}
                      </div>
                      {pr.url && (
                        <span className="truncate text-[10px] font-medium text-muted-foreground/40">
                          {pr.url.replace(/^https?:\/\//, "")}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        editVoice({
                          projects: voice.projects.filter((_, x) => x !== i),
                        })
                      }
                      className="shrink-0 rounded-lg p-1 text-muted-foreground/20 transition-all opacity-0 group-hover:opacity-100 group-hover:bg-rose-500/10 group-hover:text-rose-500"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <ProjectAdd
                onAdd={(pr) => editVoice({ projects: [...voice.projects, pr] })}
              />
            </div>

            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                Directives (Do)
              </p>
              <ItemList
                items={voice.dos}
                onRemove={(i) => editVoice({ dos: voice.dos.filter((_, x) => x !== i) })}
              />
              <div className="mt-3">
                <AddInput placeholder="New directive…" onAdd={(v) => editVoice({ dos: [...voice.dos, v] })} />
              </div>
            </div>

            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                Constraints (Don't)
              </p>
              <ItemList
                items={voice.donts}
                onRemove={(i) => editVoice({ donts: voice.donts.filter((_, x) => x !== i) })}
              />
              <div className="mt-3">
                <AddInput
                  placeholder="New constraint…"
                  onAdd={(v) => editVoice({ donts: [...voice.donts, v] })}
                />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
              Neural Echoes ({voice.samplePosts.length} fragments)
            </p>
            <div className="space-y-3">
              {voice.samplePosts.map((sp, i) => (
                <div key={i} className="group relative">
                  <textarea
                    value={sp}
                    rows={4}
                    onChange={(e) =>
                      editVoice({
                        samplePosts: voice.samplePosts.map((x, j) =>
                          j === i ? e.target.value : x,
                        ),
                      })
                    }
                    className="min-w-0 w-full resize-none rounded-xl border border-border/60 bg-secondary/5 p-3 font-mono text-[11px] leading-relaxed text-foreground/80 focus:border-brand-500/40 focus:bg-background focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      editVoice({
                        samplePosts: voice.samplePosts.filter((_, j) => j !== i),
                      })
                    }
                    className="absolute right-2 top-2 rounded-lg p-1.5 bg-background shadow-sm border border-border text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-all hover:text-rose-500 hover:border-rose-500/20"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => editVoice({ samplePosts: [...voice.samplePosts, ""] })}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-secondary/5 px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-all hover:bg-secondary/20 hover:text-foreground hover:border-brand-500/40 active:scale-[0.98]"
            >
              <Plus size={14} /> 
              Sync new fragment
            </button>
          </div>
        </CardShell>
      </div>

      <CardShell
        title="Prohibited Topics"
        hint={`${displayName("sentinel")} blocks any output intersecting these themes.`}
        dirty={bs.dirty}
        saving={bs.saving}
        onSave={() => bs.save(banned)}
        result={bs.result}
      >
        <ItemList
          danger
          items={banned.topics}
          onRemove={(i) => {
            setBanned({ topics: banned.topics.filter((_, x) => x !== i) });
            bs.setDirty(true);
          }}
        />
        <div className="mt-2">
          <AddInput
            placeholder="Prohibit theme…"
            onAdd={(v) => {
              setBanned({ topics: [...banned.topics, v] });
              bs.setDirty(true);
            }}
          />
        </div>
      </CardShell>

      <CardShell
        title="Neural Lessons"
        hint="Synthesized automatically from rejected drafts (max 40)."
        dirty={ls.dirty}
        saving={ls.saving}
        onSave={() => ls.save(lessons)}
        result={ls.result}
      >
        {lessons.lessons.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-secondary/5 px-4 py-6 text-center">
            <p className="text-[11px] font-medium text-muted-foreground/40 italic">
              Empty — rejections populate this space automatically.
            </p>
          </div>
        ) : (
          <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
            {lessons.lessons.map((l, i) => (
              <li
                key={`${l.date}-${i}`}
                className="group flex flex-col gap-1.5 rounded-xl border border-border/40 bg-secondary/10 px-3 py-2.5 transition-all hover:bg-secondary/20 hover:border-brand-500/20"
              >
                <div className="flex items-center justify-between">
                  {l.date && (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-brand-500/60">
                      Internalized {fmtDate(l.date)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setLessons({
                        lessons: lessons.lessons.filter((_, x) => x !== i),
                      });
                      ls.setDirty(true);
                    }}
                    className="rounded-lg p-1 text-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-all hover:text-rose-500 hover:bg-rose-500/10"
                  >
                    <X size={12} />
                  </button>
                </div>
                <span className="text-[12px] font-medium leading-relaxed text-foreground/80">
                  {l.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 pt-2 border-t border-border/40">
          <AddInput
            placeholder="Seed manual lesson…"
            onAdd={(v) => {
              setLessons({
                lessons: [
                  ...lessons.lessons,
                  { date: new Date().toISOString().slice(0, 10), text: v },
                ],
              });
              ls.setDirty(true);
            }}
          />
        </div>
      </CardShell>
    </div>
  );
}
