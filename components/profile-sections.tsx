"use client";

// Editable structured section cards for the profile page — Tsenta-style modal
// editors (M29): entry sidebar, labeled field grid, required-field validation,
// Cancel / Save Changes footer. The ConsolidatedDoc is canonical: every save
// regenerates the markdown corpus server-side so scoring/tailoring stay in
// sync. All components are MODULE-SCOPE (nested defs remount per keystroke —
// learned the hard way in M27).
import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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
  ChevronUp,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { updateProfileDocAction } from "@/lib/actions/profiles";
import type { ConsolidatedDoc } from "@/lib/claude/consolidate";
import SkillInput from "@/components/skill-input";
import { cn } from "@/lib/utils";

type Edu = ConsolidatedDoc["education"][number];
type Cert = ConsolidatedDoc["certifications"][number];
type Role = ConsolidatedDoc["experience"][number];
type Project = ConsolidatedDoc["projects"][number];
type SkillGroup = ConsolidatedDoc["skills"][number];

const card = "rounded-2xl border border-border bg-card p-6 shadow-sm";
const inputCls =
  "w-full rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const iconBtn =
  "p-1.5 rounded-lg bg-card border border-border text-muted-foreground transition-colors cursor-pointer disabled:opacity-40";

// ── Labeled field with Tsenta-style required validation ──────────────────────
function Field({
  label,
  value,
  onChange,
  required = false,
  showErrors = false,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  showErrors?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const invalid = required && showErrors && !value.trim();
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-bold text-foreground">
        {label}
        {required && " *"}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          inputCls,
          invalid && "border-destructive focus:border-destructive focus:ring-destructive",
        )}
      />
      {invalid && <span className="mt-1 block text-[11px] font-medium text-destructive">Required</span>}
    </label>
  );
}

// ── The modal: header · entry sidebar · field pane · footer ──────────────────
function EditModal({
  title,
  entryLabels,
  selected,
  onSelect,
  onAdd,
  addLabel,
  onMove,
  onRemove,
  dirty,
  valid,
  saving,
  error,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  entryLabels: string[];
  selected: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  addLabel: string;
  onMove: (i: number, dir: -1 | 1) => void;
  onRemove: (i: number) => void;
  dirty: boolean;
  valid: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  // Portal to <body>: the profile page's `.stagger-load` wrapper leaves a
  // lingering `transform` on its children, which would otherwise make this
  // `position: fixed` overlay resolve against that box instead of the viewport
  // (the "cramped modal" bug). Rendering at the body escapes any such ancestor.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body: sidebar + pane */}
        <div className="flex min-h-0 flex-1">
          <div className="flex w-52 shrink-0 flex-col border-r border-border">
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {entryLabels.map((label, i) => (
                <div
                  key={i}
                  className={cn(
                    "group mb-1 flex items-center gap-1 rounded-lg transition-colors",
                    i === selected ? "bg-brand-50 dark:bg-brand-950/30" : "hover:bg-secondary/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className={cn(
                      "min-w-0 flex-1 truncate px-3 py-2 text-left text-sm font-medium cursor-pointer",
                      i === selected ? "font-bold text-brand-700 dark:text-brand-300" : "text-foreground",
                    )}
                  >
                    {label || <span className="italic text-muted-foreground/60">New entry</span>}
                  </button>
                  <div className="mr-1 hidden shrink-0 flex-col group-hover:flex">
                    <button type="button" disabled={i === 0} onClick={() => onMove(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer">
                      <ChevronUp size={12} />
                    </button>
                    <button type="button" disabled={i === entryLabels.length - 1} onClick={() => onMove(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer">
                      <ChevronDown size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onAdd}
              className="m-2 flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-brand-600 hover:border-brand-500/40 transition-colors cursor-pointer"
            >
              <Plus size={13} /> {addLabel}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {entryLabels.length === 0 ? (
              <p className="text-sm italic text-muted-foreground/60">
                Nothing here yet — use “{addLabel}”.
              </p>
            ) : (
              <>
                {children}
                <button
                  type="button"
                  onClick={() => onRemove(selected)}
                  className="mt-5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                >
                  <Trash2 size={13} /> Remove this entry
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          {error && (
            <p className="mr-auto flex items-center gap-1.5 text-xs font-medium text-destructive">
              <AlertCircle size={13} /> {error}
            </p>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-all active:scale-95 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !dirty || !valid}
            onClick={onSave}
            title={!valid ? "Fill the required fields first" : undefined}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={3} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Shared per-section state: draft list + selection + save plumbing ─────────
function useSectionModal<T>(
  profileId: string,
  doc: ConsolidatedDoc,
  pick: (d: ConsolidatedDoc) => T[],
  put: (d: ConsolidatedDoc, v: T[]) => ConsolidatedDoc,
  blank: () => T,
) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T[]>([]);
  const [selected, setSelected] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const original = useMemo(() => pick(doc), [doc, pick]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(original), [draft, original]);

  return {
    open,
    draft,
    selected,
    attempted,
    error,
    saving,
    dirty,
    current: draft[selected],
    openModal: () => {
      setDraft(structuredClone(original));
      setSelected(0);
      setAttempted(false);
      setError(null);
      setOpen(true);
    },
    close: () => setOpen(false),
    select: setSelected,
    update: (i: number, patch: Partial<T>) =>
      setDraft((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x))),
    add: () => {
      setDraft((d) => [...d, blank()]);
      setSelected(draft.length);
    },
    remove: (i: number) => {
      setDraft((d) => d.filter((_, j) => j !== i));
      setSelected((s) => Math.max(0, Math.min(s, draft.length - 2)));
    },
    move: (i: number, dir: -1 | 1) => {
      setDraft((d) => {
        const next = [...d];
        const j = i + dir;
        if (j < 0 || j >= next.length) return d;
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
      setSelected(i + dir);
    },
    save: (valid: boolean) => {
      setAttempted(true);
      if (!valid) return;
      startSaving(async () => {
        const res = await updateProfileDocAction(profileId, put(doc, draft));
        if (res.ok) location.reload(); // content regenerated server-side too
        else setError(res.error);
      });
    },
  };
}

// ── Card chrome (read view + pencil) ─────────────────────────────────────────
function CardShell({
  icon,
  title,
  meta,
  onEdit,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={card}>
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {meta && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{meta}</span>
        )}
        <button type="button" title={`Edit ${title.toLowerCase()}`} onClick={onEdit} className={cn(iconBtn, "ml-auto hover:text-brand-600")}>
          <Pencil size={13} />
        </button>
      </div>
      {children}
    </section>
  );
}

// ── Experience ────────────────────────────────────────────────────────────────
export function ExperienceCard({ profileId, doc }: { profileId: string; doc: ConsolidatedDoc }) {
  const m = useSectionModal<Role>(
    profileId,
    doc,
    (d) => d.experience,
    (d, v) => ({ ...d, experience: v }),
    () => ({ company: "", title: "", location: null, dates: "", bullets: [] }),
  );
  const valid = m.draft.every((r) => r.title.trim() && r.company.trim());
  const e = m.current;

  return (
    <>
      <CardShell
        icon={<Briefcase size={16} className="text-brand-500" />}
        title="Experience"
        meta={`${doc.experience.length} role${doc.experience.length === 1 ? "" : "s"}`}
        onEdit={m.openModal}
      >
        <div className="space-y-5">
          {doc.experience.map((r) => (
            <div key={`${r.company}-${r.title}`}>
              <p className="text-sm font-bold text-foreground">{r.title}</p>
              <p className="text-xs font-medium text-muted-foreground">
                {r.company}
                {r.location ? ` · ${r.location}` : ""} · {r.dates}
              </p>
              <ul className="mt-1.5 space-y-1">
                {r.bullets.map((b) => (
                  <li key={b} className="pl-3 text-xs font-medium text-muted-foreground leading-relaxed relative before:content-['•'] before:absolute before:left-0">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardShell>

      {m.open && (
        <EditModal
          title="Edit Experience"
          entryLabels={m.draft.map((r) => [r.title, r.company].filter(Boolean).join(" — "))}
          selected={m.selected}
          onSelect={m.select}
          onAdd={m.add}
          addLabel="Add Role"
          onMove={m.move}
          onRemove={m.remove}
          dirty={m.dirty}
          valid={valid}
          saving={m.saving}
          error={m.error}
          onSave={() => m.save(valid)}
          onCancel={m.close}
        >
          {e && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-muted-foreground">Role {m.selected + 1}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Job Title" required showErrors={m.attempted} value={e.title} onChange={(v) => m.update(m.selected, { title: v })} />
                <Field label="Company" required showErrors={m.attempted} value={e.company} onChange={(v) => m.update(m.selected, { company: v })} />
                <Field label="Location" value={e.location ?? ""} onChange={(v) => m.update(m.selected, { location: v || null })} />
                <Field label="Dates" placeholder="e.g. Feb 2019 – May 2024" value={e.dates} onChange={(v) => m.update(m.selected, { dates: v })} />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-foreground">Bullets — one per line</span>
                <textarea
                  value={e.bullets.join("\n")}
                  rows={Math.max(4, e.bullets.length + 1)}
                  onChange={(ev) => m.update(m.selected, { bullets: ev.target.value.split("\n") })}
                  className={cn(inputCls, "font-mono text-xs leading-relaxed")}
                />
              </label>
            </div>
          )}
        </EditModal>
      )}
    </>
  );
}

// ── Skills ────────────────────────────────────────────────────────────────────
export function SkillsCard({ profileId, doc }: { profileId: string; doc: ConsolidatedDoc }) {
  const m = useSectionModal<SkillGroup>(
    profileId,
    doc,
    (d) => d.skills,
    (d, v) => ({ ...d, skills: v }),
    () => ({ group: "", items: [] }),
  );
  const valid = m.draft.every((g) => g.group.trim());
  const g = m.current;

  return (
    <>
      <CardShell icon={<Code2 size={16} className="text-brand-500" />} title="Skills" onEdit={m.openModal}>
        <div className="space-y-3">
          {doc.skills.map((grp) => (
            <div key={grp.group}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{grp.group}</p>
              <div className="flex flex-wrap gap-1.5">
                {grp.items.map((sk) => (
                  <span key={sk} className="rounded-lg bg-secondary/50 px-2 py-0.5 text-xs font-bold text-foreground">
                    {sk}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardShell>

      {m.open && (
        <EditModal
          title="Edit Skills"
          entryLabels={m.draft.map((x) => x.group)}
          selected={m.selected}
          onSelect={m.select}
          onAdd={m.add}
          addLabel="Add Group"
          onMove={m.move}
          onRemove={m.remove}
          dirty={m.dirty}
          valid={valid}
          saving={m.saving}
          error={m.error}
          onSave={() => m.save(valid)}
          onCancel={m.close}
        >
          {g && (
            <div className="space-y-4">
              <Field label="Group Name" required showErrors={m.attempted} placeholder="e.g. Frontend" value={g.group} onChange={(v) => m.update(m.selected, { group: v })} />
              <div>
                <span className="mb-1 block text-xs font-bold text-foreground">Skills</span>
                <SkillInput
                  items={g.items.filter(Boolean)}
                  onChange={(items) => m.update(m.selected, { items })}
                  placeholder="Type to search skills, or add your own…"
                />
              </div>
            </div>
          )}
        </EditModal>
      )}
    </>
  );
}

// ── Education ─────────────────────────────────────────────────────────────────
export function EducationCard({ profileId, doc }: { profileId: string; doc: ConsolidatedDoc }) {
  const m = useSectionModal<Edu>(
    profileId,
    doc,
    (d) => d.education,
    (d, v) => ({ ...d, education: v }),
    () => ({
      school: "",
      degree: null,
      field: null,
      minor: null,
      gpa: null,
      startDate: null,
      endDate: null,
      location: null,
      detail: null,
    }),
  );
  const valid = m.draft.every((x) => x.school.trim() && (x.degree ?? "").trim());
  const e = m.current;

  const readLine = (x: Edu) =>
    [
      [x.degree, x.field].filter(Boolean).join(" in "),
      x.minor && `Minor: ${x.minor}`,
      x.gpa && `GPA ${x.gpa}`,
      [x.startDate, x.endDate].filter(Boolean).join(" – ") || null,
      x.location,
      x.detail,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <CardShell icon={<GraduationCap size={16} className="text-brand-500" />} title="Education" onEdit={m.openModal}>
        {doc.education.map((x) => (
          <div key={x.school} className="mb-2 last:mb-0">
            <p className="text-sm font-bold text-foreground">{x.school}</p>
            <p className="text-xs font-medium text-muted-foreground">{readLine(x)}</p>
          </div>
        ))}
      </CardShell>

      {m.open && (
        <EditModal
          title="Edit Education"
          entryLabels={m.draft.map((x) => x.school)}
          selected={m.selected}
          onSelect={m.select}
          onAdd={m.add}
          addLabel="Add Education"
          onMove={m.move}
          onRemove={m.remove}
          dirty={m.dirty}
          valid={valid}
          saving={m.saving}
          error={m.error}
          onSave={() => m.save(valid)}
          onCancel={m.close}
        >
          {e && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-muted-foreground">Education {m.selected + 1}</p>
              <Field label="University" required showErrors={m.attempted} value={e.school} onChange={(v) => m.update(m.selected, { school: v })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Degree" required showErrors={m.attempted} placeholder="e.g. Masters" value={e.degree ?? ""} onChange={(v) => m.update(m.selected, { degree: v || null })} />
                <Field label="Major" placeholder="e.g. Computer Science" value={e.field ?? ""} onChange={(v) => m.update(m.selected, { field: v || null })} />
                <Field label="Minor" value={e.minor ?? ""} onChange={(v) => m.update(m.selected, { minor: v || null })} />
                <Field label="GPA" placeholder="e.g. 3.7" value={e.gpa ?? ""} onChange={(v) => m.update(m.selected, { gpa: v || null })} />
                <Field label="Start Date" placeholder="e.g. Sep 2024" value={e.startDate ?? ""} onChange={(v) => m.update(m.selected, { startDate: v || null })} />
                <Field label="End Date (expected)" placeholder="e.g. Mar 2026" value={e.endDate ?? ""} onChange={(v) => m.update(m.selected, { endDate: v || null })} />
                <Field label="Location" value={e.location ?? ""} onChange={(v) => m.update(m.selected, { location: v || null })} />
                <Field label="Detail" placeholder="Anything else worth keeping" value={e.detail ?? ""} onChange={(v) => m.update(m.selected, { detail: v || null })} />
              </div>
            </div>
          )}
        </EditModal>
      )}
    </>
  );
}

// ── Certifications ───────────────────────────────────────────────────────────
export function CertificationsCard({ profileId, doc }: { profileId: string; doc: ConsolidatedDoc }) {
  const m = useSectionModal<Cert>(
    profileId,
    doc,
    (d) => d.certifications,
    (d, v) => ({ ...d, certifications: v }),
    () => ({
      name: "",
      organization: null,
      issueDate: null,
      expirationDate: null,
      credentialId: null,
      credentialUrl: null,
    }),
  );
  const valid = m.draft.every((c) => c.name.trim() && (c.organization ?? "").trim());
  const c = m.current;

  return (
    <>
      <CardShell icon={<BadgeCheck size={16} className="text-brand-500" />} title="Certifications" onEdit={m.openModal}>
        {doc.certifications.length ? (
          doc.certifications.map((x) => (
            <div key={x.name} className="mb-2 last:mb-0">
              <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                {x.name}
                {x.credentialUrl && (
                  <a href={x.credentialUrl} target="_blank" rel="noreferrer" title="Credential" className="text-muted-foreground hover:text-brand-600">
                    <ExternalLink size={12} />
                  </a>
                )}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {[
                  x.organization,
                  [x.issueDate, x.expirationDate].filter(Boolean).join(" – ") || null,
                  x.credentialId && `ID ${x.credentialId}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          ))
        ) : (
          <p className="text-xs italic text-muted-foreground/60">Add credentials, badges, or licenses.</p>
        )}
      </CardShell>

      {m.open && (
        <EditModal
          title="Edit Certifications"
          entryLabels={m.draft.map((x) => x.name)}
          selected={m.selected}
          onSelect={m.select}
          onAdd={m.add}
          addLabel="Add Certification"
          onMove={m.move}
          onRemove={m.remove}
          dirty={m.dirty}
          valid={valid}
          saving={m.saving}
          error={m.error}
          onSave={() => m.save(valid)}
          onCancel={m.close}
        >
          {c && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-muted-foreground">Certification {m.selected + 1}</p>
              <Field label="Certification Name" required showErrors={m.attempted} value={c.name} onChange={(v) => m.update(m.selected, { name: v })} />
              <Field label="Issuing Organization" required showErrors={m.attempted} value={c.organization ?? ""} onChange={(v) => m.update(m.selected, { organization: v || null })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Issue Date" value={c.issueDate ?? ""} onChange={(v) => m.update(m.selected, { issueDate: v || null })} />
                <Field label="Expiration Date" value={c.expirationDate ?? ""} onChange={(v) => m.update(m.selected, { expirationDate: v || null })} />
              </div>
              <Field label="Credential ID" placeholder="Optional" value={c.credentialId ?? ""} onChange={(v) => m.update(m.selected, { credentialId: v || null })} />
              <Field label="Credential URL" placeholder="https://…" value={c.credentialUrl ?? ""} onChange={(v) => m.update(m.selected, { credentialUrl: v || null })} />
            </div>
          )}
        </EditModal>
      )}
    </>
  );
}

// ── Projects ─────────────────────────────────────────────────────────────────
export function ProjectsCard({ profileId, doc }: { profileId: string; doc: ConsolidatedDoc }) {
  const m = useSectionModal<Project>(
    profileId,
    doc,
    (d) => d.projects,
    (d, v) => ({ ...d, projects: v }),
    () => ({ name: "", blurb: null, bullets: [] }),
  );
  const valid = m.draft.every((p) => p.name.trim());
  const p = m.current;

  return (
    <>
      <CardShell
        icon={<Rocket size={16} className="text-brand-500" />}
        title="Projects"
        meta={doc.projects.length ? `${doc.projects.length}` : undefined}
        onEdit={m.openModal}
      >
        {doc.projects.length ? (
          <div className="space-y-4">
            {doc.projects.map((x) => (
              <div key={x.name}>
                <p className="text-sm font-bold text-foreground">
                  {x.name}
                  {x.blurb && <span className="font-medium text-muted-foreground"> — {x.blurb}</span>}
                </p>
                <ul className="mt-1 space-y-1">
                  {x.bullets.map((b) => (
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
        )}
      </CardShell>

      {m.open && (
        <EditModal
          title="Edit Projects"
          entryLabels={m.draft.map((x) => x.name)}
          selected={m.selected}
          onSelect={m.select}
          onAdd={m.add}
          addLabel="Add Project"
          onMove={m.move}
          onRemove={m.remove}
          dirty={m.dirty}
          valid={valid}
          saving={m.saving}
          error={m.error}
          onSave={() => m.save(valid)}
          onCancel={m.close}
        >
          {p && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-muted-foreground">Project {m.selected + 1}</p>
              <Field label="Project Name" required showErrors={m.attempted} value={p.name} onChange={(v) => m.update(m.selected, { name: v })} />
              <Field label="One-line Blurb" value={p.blurb ?? ""} onChange={(v) => m.update(m.selected, { blurb: v || null })} />
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-foreground">Bullets — one per line</span>
                <textarea
                  value={p.bullets.join("\n")}
                  rows={Math.max(3, p.bullets.length + 1)}
                  onChange={(ev) => m.update(m.selected, { bullets: ev.target.value.split("\n") })}
                  className={cn(inputCls, "font-mono text-xs leading-relaxed")}
                />
              </label>
            </div>
          )}
        </EditModal>
      )}
    </>
  );
}
