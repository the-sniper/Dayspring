"use client";

// Editable structured section cards for the profile page (M28) — Tsenta-style
// per-card Edit. The ConsolidatedDoc is canonical: every save also regenerates
// the markdown corpus server-side, so scoring/tailoring stay in sync.
//
// All editors are MODULE-SCOPE components — defining them inside a card
// remounts the fields on every keystroke (learned the hard way in M27).
import { useState, useTransition } from "react";
import {
  Briefcase,
  GraduationCap,
  Code2,
  Rocket,
  BadgeCheck,
  Pencil,
  Check,
  X,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { updateProfileDocAction } from "@/lib/actions/profiles";
import type { ConsolidatedDoc } from "@/lib/claude/consolidate";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border border-border bg-card p-6 shadow-sm";
const inputCls =
  "w-full rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
const iconBtn =
  "p-1.5 rounded-lg bg-card border border-border text-muted-foreground transition-colors cursor-pointer disabled:opacity-40";

// Shared card chrome: title row with Edit / Save / Cancel; children swap
// between the read view and the editor.
function EditableCard({
  icon,
  title,
  meta,
  editing,
  pending,
  error,
  onEdit,
  onSave,
  onCancel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  editing: boolean;
  pending: boolean;
  error: string | null;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={card}>
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {meta && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {meta}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {!editing ? (
            <button type="button" title={`Edit ${title.toLowerCase()}`} onClick={onEdit} className={cn(iconBtn, "hover:text-brand-600")}>
              <Pencil size={13} />
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={onSave}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
                Save
              </button>
              <button type="button" disabled={pending} onClick={onCancel} className={iconBtn}>
                <X size={13} />
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="mb-3 flex items-start gap-1.5 text-[11px] font-medium text-destructive">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {children}
    </section>
  );
}

// One hook powering every card: draft state + save-the-whole-doc plumbing.
function useDocSection<T>(
  profileId: number,
  doc: ConsolidatedDoc,
  pick: (d: ConsolidatedDoc) => T,
  put: (d: ConsolidatedDoc, v: T) => ConsolidatedDoc,
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(() => pick(doc));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return {
    editing,
    draft,
    setDraft,
    error,
    pending,
    edit: () => {
      setDraft(structuredClone(pick(doc)));
      setError(null);
      setEditing(true);
    },
    cancel: () => setEditing(false),
    save: () =>
      startTransition(async () => {
        const res = await updateProfileDocAction(profileId, put(doc, draft));
        if (res.ok) location.reload(); // server regenerated content too
        else setError(res.error);
      }),
  };
}

// ── Experience ────────────────────────────────────────────────────────────────
export function ExperienceCard({ profileId, doc }: { profileId: number; doc: ConsolidatedDoc }) {
  const s = useDocSection(
    profileId,
    doc,
    (d) => d.experience,
    (d, v) => ({ ...d, experience: v }),
  );

  return (
    <EditableCard
      icon={<Briefcase size={16} className="text-brand-500" />}
      title="Experience"
      meta={`${doc.experience.length} role${doc.experience.length === 1 ? "" : "s"}`}
      editing={s.editing}
      pending={s.pending}
      error={s.error}
      onEdit={s.edit}
      onSave={s.save}
      onCancel={s.cancel}
    >
      {!s.editing ? (
        <div className="space-y-5">
          {doc.experience.map((e) => (
            <div key={`${e.company}-${e.title}`}>
              <p className="text-sm font-bold text-foreground">{e.title}</p>
              <p className="text-xs font-medium text-muted-foreground">
                {e.company}
                {e.location ? ` · ${e.location}` : ""} · {e.dates}
              </p>
              <ul className="mt-1.5 space-y-1">
                {e.bullets.map((b) => (
                  <li key={b} className="pl-3 text-xs font-medium text-muted-foreground leading-relaxed relative before:content-['•'] before:absolute before:left-0">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {s.draft.map((e, i) => (
            <div key={i} className="rounded-xl border border-border bg-secondary/10 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className={labelCls}>Title</span>
                  <input value={e.title} onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, title: ev.target.value } : x)))} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>Company</span>
                  <input value={e.company} onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, company: ev.target.value } : x)))} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>Location</span>
                  <input value={e.location ?? ""} onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, location: ev.target.value || null } : x)))} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>Dates</span>
                  <input value={e.dates} placeholder="e.g. Mar 2026 – Present" onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, dates: ev.target.value } : x)))} className={inputCls} />
                </label>
              </div>
              <label className="block">
                <span className={labelCls}>Bullets — one per line</span>
                <textarea
                  value={e.bullets.join("\n")}
                  rows={Math.max(3, e.bullets.length + 1)}
                  onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, bullets: ev.target.value.split("\n") } : x)))}
                  className={cn(inputCls, "font-mono text-xs leading-relaxed")}
                />
              </label>
              <button
                type="button"
                onClick={() => s.setDraft(s.draft.filter((_, j) => j !== i))}
                className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-destructive cursor-pointer"
              >
                <Trash2 size={12} /> Remove this role
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => s.setDraft([...s.draft, { company: "", title: "", location: null, dates: "", bullets: [] }])}
            className="flex items-center gap-1 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-brand-600 hover:border-brand-500/40 transition-colors cursor-pointer"
          >
            <Plus size={12} /> Add role
          </button>
        </div>
      )}
    </EditableCard>
  );
}

// ── Skills ────────────────────────────────────────────────────────────────────
export function SkillsCard({ profileId, doc }: { profileId: number; doc: ConsolidatedDoc }) {
  const s = useDocSection(
    profileId,
    doc,
    (d) => d.skills,
    (d, v) => ({ ...d, skills: v }),
  );

  return (
    <EditableCard
      icon={<Code2 size={16} className="text-brand-500" />}
      title="Skills"
      editing={s.editing}
      pending={s.pending}
      error={s.error}
      onEdit={s.edit}
      onSave={s.save}
      onCancel={s.cancel}
    >
      {!s.editing ? (
        <div className="space-y-3">
          {doc.skills.map((g) => (
            <div key={g.group}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {g.group}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((sk) => (
                  <span key={sk} className="rounded-lg bg-secondary/50 px-2 py-0.5 text-xs font-bold text-foreground">
                    {sk}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {s.draft.map((g, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                value={g.group}
                placeholder="Group"
                onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, group: ev.target.value } : x)))}
                className={cn(inputCls, "w-40 shrink-0")}
              />
              <input
                value={g.items.join(", ")}
                placeholder="Comma-separated skills"
                onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, items: ev.target.value.split(",").map((t) => t.trim()) } : x)))}
                className={inputCls}
              />
              <button type="button" title="Remove group" onClick={() => s.setDraft(s.draft.filter((_, j) => j !== i))} className={cn(iconBtn, "hover:text-destructive mt-1")}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => s.setDraft([...s.draft, { group: "", items: [] }])}
            className="flex items-center gap-1 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-brand-600 hover:border-brand-500/40 transition-colors cursor-pointer"
          >
            <Plus size={12} /> Add group
          </button>
        </div>
      )}
    </EditableCard>
  );
}

// ── Education ─────────────────────────────────────────────────────────────────
export function EducationCard({ profileId, doc }: { profileId: number; doc: ConsolidatedDoc }) {
  const s = useDocSection(
    profileId,
    doc,
    (d) => d.education,
    (d, v) => ({ ...d, education: v }),
  );

  return (
    <EditableCard
      icon={<GraduationCap size={16} className="text-brand-500" />}
      title="Education"
      editing={s.editing}
      pending={s.pending}
      error={s.error}
      onEdit={s.edit}
      onSave={s.save}
      onCancel={s.cancel}
    >
      {!s.editing ? (
        doc.education.map((e) => (
          <div key={e.school} className="mb-2 last:mb-0">
            <p className="text-sm font-bold text-foreground">{e.school}</p>
            <p className="text-xs font-medium text-muted-foreground">
              {[e.degree, e.dates, e.detail].filter(Boolean).join(" · ")}
            </p>
          </div>
        ))
      ) : (
        <div className="space-y-3">
          {s.draft.map((e, i) => (
            <div key={i} className="rounded-xl border border-border bg-secondary/10 p-3 space-y-2">
              <input value={e.school} placeholder="School" onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, school: ev.target.value } : x)))} className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <input value={e.degree ?? ""} placeholder="Degree" onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, degree: ev.target.value || null } : x)))} className={inputCls} />
                <input value={e.dates ?? ""} placeholder="Dates" onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, dates: ev.target.value || null } : x)))} className={inputCls} />
              </div>
              <input value={e.detail ?? ""} placeholder="Detail (GPA, concentration…)" onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, detail: ev.target.value || null } : x)))} className={inputCls} />
              <button type="button" onClick={() => s.setDraft(s.draft.filter((_, j) => j !== i))} className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-destructive cursor-pointer">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => s.setDraft([...s.draft, { school: "", degree: null, dates: null, detail: null }])}
            className="flex items-center gap-1 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-brand-600 hover:border-brand-500/40 transition-colors cursor-pointer"
          >
            <Plus size={12} /> Add entry
          </button>
        </div>
      )}
    </EditableCard>
  );
}

// ── Certifications ───────────────────────────────────────────────────────────
export function CertificationsCard({ profileId, doc }: { profileId: number; doc: ConsolidatedDoc }) {
  const s = useDocSection(
    profileId,
    doc,
    (d) => d.certifications.join("\n"),
    (d, v) => ({ ...d, certifications: v.split("\n") }),
  );

  return (
    <EditableCard
      icon={<BadgeCheck size={16} className="text-brand-500" />}
      title="Certifications"
      editing={s.editing}
      pending={s.pending}
      error={s.error}
      onEdit={s.edit}
      onSave={s.save}
      onCancel={s.cancel}
    >
      {!s.editing ? (
        doc.certifications.length ? (
          doc.certifications.map((c) => (
            <p key={c} className="text-xs font-medium text-muted-foreground">
              · {c}
            </p>
          ))
        ) : (
          <p className="text-xs italic text-muted-foreground/60">None on file.</p>
        )
      ) : (
        <textarea
          value={s.draft}
          rows={4}
          placeholder={"One per line, e.g.\nAWS Solutions Architect Associate (2027)"}
          onChange={(ev) => s.setDraft(ev.target.value)}
          className={cn(inputCls, "font-mono text-xs leading-relaxed")}
        />
      )}
    </EditableCard>
  );
}

// ── Projects ─────────────────────────────────────────────────────────────────
export function ProjectsCard({ profileId, doc }: { profileId: number; doc: ConsolidatedDoc }) {
  const s = useDocSection(
    profileId,
    doc,
    (d) => d.projects,
    (d, v) => ({ ...d, projects: v }),
  );

  return (
    <EditableCard
      icon={<Rocket size={16} className="text-brand-500" />}
      title="Projects"
      meta={doc.projects.length ? `${doc.projects.length}` : undefined}
      editing={s.editing}
      pending={s.pending}
      error={s.error}
      onEdit={s.edit}
      onSave={s.save}
      onCancel={s.cancel}
    >
      {!s.editing ? (
        doc.projects.length ? (
          <div className="space-y-4">
            {doc.projects.map((p) => (
              <div key={p.name}>
                <p className="text-sm font-bold text-foreground">
                  {p.name}
                  {p.blurb && <span className="font-medium text-muted-foreground"> — {p.blurb}</span>}
                </p>
                <ul className="mt-1 space-y-1">
                  {p.bullets.map((b) => (
                    <li key={b} className="pl-3 text-xs font-medium text-muted-foreground leading-relaxed relative before:content-['•'] before:absolute before:left-0">
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground/60">None on file.</p>
        )
      ) : (
        <div className="space-y-4">
          {s.draft.map((p, i) => (
            <div key={i} className="rounded-xl border border-border bg-secondary/10 p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={p.name} placeholder="Project name" onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} className={inputCls} />
                <input value={p.blurb ?? ""} placeholder="One-line blurb" onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, blurb: ev.target.value || null } : x)))} className={inputCls} />
              </div>
              <textarea
                value={p.bullets.join("\n")}
                rows={Math.max(2, p.bullets.length + 1)}
                placeholder="Bullets — one per line"
                onChange={(ev) => s.setDraft(s.draft.map((x, j) => (j === i ? { ...x, bullets: ev.target.value.split("\n") } : x)))}
                className={cn(inputCls, "font-mono text-xs leading-relaxed")}
              />
              <button type="button" onClick={() => s.setDraft(s.draft.filter((_, j) => j !== i))} className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-destructive cursor-pointer">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => s.setDraft([...s.draft, { name: "", blurb: null, bullets: [] }])}
            className="flex items-center gap-1 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-brand-600 hover:border-brand-500/40 transition-colors cursor-pointer"
          >
            <Plus size={12} /> Add project
          </button>
        </div>
      )}
    </EditableCard>
  );
}
