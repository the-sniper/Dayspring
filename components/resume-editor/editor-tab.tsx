"use client";

// Editor tab — direct control over every field. Collapsible cards per section,
// drag-to-reorder sections (framer-motion Reorder), show/hide sections,
// add/edit/delete entries and bullets, and the Personal Info form.
import { useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import type { ResumeDocType } from "@/lib/claude/resume";
import {
  SECTION_LABELS,
  type ResumeSectionId,
  type ResumeStyle,
} from "@/lib/resumes/style";
import { cn } from "@/lib/utils";

type Doc = ResumeDocType;

const INPUT =
  "w-full rounded-lg border border-border bg-secondary/30 px-2.5 py-1.5 text-xs font-medium text-foreground transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder:text-muted-foreground/50";
const TEXTAREA = `${INPUT} resize-y leading-relaxed`;
const LABEL = "mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
const ADD_BTN =
  "flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:border-brand-500/50 hover:text-brand-600 cursor-pointer";
const DEL_BTN =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 cursor-pointer";

export default function EditorTab({
  doc,
  style,
  onDoc,
  onStyle,
}: {
  doc: Doc;
  style: ResumeStyle;
  onDoc: (d: Doc) => void;
  onStyle: (s: ResumeStyle) => void;
}) {
  const set = (patch: Partial<Doc>) => onDoc({ ...doc, ...patch });

  return (
    <div className="space-y-3 p-4">
      <PersonalInfoCard doc={doc} onDoc={onDoc} />

      <Reorder.Group
        axis="y"
        values={style.sectionOrder}
        onReorder={(order: ResumeSectionId[]) =>
          onStyle({ ...style, sectionOrder: order })
        }
        className="space-y-3"
      >
        {style.sectionOrder.map((id) => (
          <SectionCard
            key={id}
            id={id}
            hidden={style.hiddenSections.includes(id)}
            onToggleHidden={() =>
              onStyle({
                ...style,
                hiddenSections: style.hiddenSections.includes(id)
                  ? style.hiddenSections.filter((s) => s !== id)
                  : [...style.hiddenSections, id],
              })
            }
          >
            {id === "summary" && (
              <textarea
                rows={4}
                value={doc.summary ?? ""}
                onChange={(e) => set({ summary: e.target.value || null })}
                placeholder="2–3 lines positioning you for this job…"
                className={TEXTAREA}
              />
            )}
            {id === "skills" && <SkillsEditor doc={doc} onDoc={onDoc} />}
            {id === "experience" && <ExperienceEditor doc={doc} onDoc={onDoc} />}
            {id === "projects" && <ProjectsEditor doc={doc} onDoc={onDoc} />}
            {id === "education" && <EducationEditor doc={doc} onDoc={onDoc} />}
          </SectionCard>
        ))}
      </Reorder.Group>
    </div>
  );
}

// ── Section chrome ────────────────────────────────────────────────────────────

function SectionCard({
  id,
  hidden,
  onToggleHidden,
  children,
}: {
  id: ResumeSectionId;
  hidden: boolean;
  onToggleHidden: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className={cn(
        "rounded-xl border border-border bg-secondary/10",
        hidden && "opacity-55",
      )}
    >
      <div className="flex items-center gap-1.5 px-2 py-2">
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          className="flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          aria-label={`Reorder ${SECTION_LABELS[id]}`}
        >
          <GripVertical size={14} />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
        >
          <span className="truncate text-xs font-bold text-foreground">
            {SECTION_LABELS[id]}
          </span>
          <ChevronDown
            size={14}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        <button
          type="button"
          onClick={onToggleHidden}
          title={hidden ? "Show this section on the resume" : "Hide this section from the resume"}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
        >
          {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
      {open && <div className="border-t border-border/60 p-3">{children}</div>}
    </Reorder.Item>
  );
}

// ── Personal info ─────────────────────────────────────────────────────────────

function PersonalInfoCard({ doc, onDoc }: { doc: Doc; onDoc: (d: Doc) => void }) {
  const [open, setOpen] = useState(false);
  const setContact = (k: keyof Doc["contact"], v: string) =>
    onDoc({ ...doc, contact: { ...doc.contact, [k]: v || null } });

  return (
    <div className="rounded-xl border border-border bg-secondary/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left cursor-pointer"
      >
        <span className="text-xs font-bold text-foreground">Personal Info</span>
        <ChevronDown
          size={14}
          className={cn("text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2.5 border-t border-border/60 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={LABEL}>Full name</label>
            <input
              value={doc.name}
              onChange={(e) => onDoc({ ...doc, name: e.target.value })}
              className={INPUT}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Headline</label>
            <input
              value={doc.headline ?? ""}
              onChange={(e) => onDoc({ ...doc, headline: e.target.value || null })}
              placeholder="Mirror the exact posted job title"
              className={INPUT}
            />
          </div>
          {(
            [
              ["email", "Email"],
              ["phone", "Phone"],
              ["location", "Location"],
              ["linkedin", "LinkedIn"],
              ["website", "Website"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className={LABEL}>{label}</label>
              <input
                value={doc.contact[key] ?? ""}
                onChange={(e) => setContact(key, e.target.value)}
                className={INPUT}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bullets (shared) ──────────────────────────────────────────────────────────

function BulletsEditor({
  bullets,
  onChange,
}: {
  bullets: string[];
  onChange: (b: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {bullets.map((b, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <textarea
            rows={2}
            value={b}
            onChange={(e) =>
              onChange(bullets.map((x, xi) => (xi === i ? e.target.value : x)))
            }
            className={TEXTAREA}
          />
          <button
            type="button"
            onClick={() => onChange(bullets.filter((_, xi) => xi !== i))}
            className={DEL_BTN}
            aria-label="Delete bullet"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...bullets, ""])} className={ADD_BTN}>
        <Plus size={11} />
        Add bullet
      </button>
    </div>
  );
}

// ── Skills ────────────────────────────────────────────────────────────────────

function SkillsEditor({ doc, onDoc }: { doc: Doc; onDoc: (d: Doc) => void }) {
  const setGroups = (skills: Doc["skills"]) => onDoc({ ...doc, skills });
  return (
    <div className="space-y-3">
      {doc.skills.map((g, gi) => (
        <div key={gi} className="rounded-lg border border-border/60 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <input
              value={g.group}
              onChange={(e) =>
                setGroups(
                  doc.skills.map((x, xi) =>
                    xi === gi ? { ...x, group: e.target.value } : x,
                  ),
                )
              }
              placeholder="Group name"
              className={cn(INPUT, "font-bold")}
            />
            <button
              type="button"
              onClick={() => setGroups(doc.skills.filter((_, xi) => xi !== gi))}
              className={DEL_BTN}
              aria-label="Delete skill group"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <textarea
            rows={2}
            value={g.items.join(", ")}
            onChange={(e) =>
              setGroups(
                doc.skills.map((x, xi) =>
                  xi === gi
                    ? {
                        ...x,
                        items: e.target.value
                          .split(",")
                          .map((s) => s.trimStart())
                          .filter((s, i2, arr) => s !== "" || i2 === arr.length - 1),
                      }
                    : x,
                ),
              )
            }
            placeholder="Comma-separated skills"
            className={TEXTAREA}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setGroups([...doc.skills, { group: "", items: [] }])}
        className={ADD_BTN}
      >
        <Plus size={11} />
        Add skill group
      </button>
    </div>
  );
}

// ── Experience ────────────────────────────────────────────────────────────────

function ExperienceEditor({ doc, onDoc }: { doc: Doc; onDoc: (d: Doc) => void }) {
  const setExp = (experience: Doc["experience"]) => onDoc({ ...doc, experience });
  const upd = (i: number, patch: Partial<Doc["experience"][number]>) =>
    setExp(doc.experience.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-3">
      {doc.experience.map((e, i) => (
        <div key={i} className="rounded-lg border border-border/60 p-2.5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-[11px] font-bold text-muted-foreground">Role {i + 1}</p>
            <button
              type="button"
              onClick={() => setExp(doc.experience.filter((_, xi) => xi !== i))}
              className={DEL_BTN}
              aria-label="Delete role"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Title</label>
              <input value={e.title} onChange={(ev) => upd(i, { title: ev.target.value })} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Company</label>
              <input value={e.company} onChange={(ev) => upd(i, { company: ev.target.value })} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Location</label>
              <input
                value={e.location ?? ""}
                onChange={(ev) => upd(i, { location: ev.target.value || null })}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Dates</label>
              <input
                value={e.dates}
                onChange={(ev) => upd(i, { dates: ev.target.value })}
                placeholder="Jan 2020 – Present"
                className={INPUT}
              />
            </div>
          </div>
          <BulletsEditor bullets={e.bullets} onChange={(bullets) => upd(i, { bullets })} />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setExp([
            ...doc.experience,
            { company: "", title: "", location: null, dates: "", bullets: [""] },
          ])
        }
        className={ADD_BTN}
      >
        <Plus size={11} />
        Add role
      </button>
    </div>
  );
}

// ── Projects ──────────────────────────────────────────────────────────────────

function ProjectsEditor({ doc, onDoc }: { doc: Doc; onDoc: (d: Doc) => void }) {
  const setProjects = (projects: Doc["projects"]) => onDoc({ ...doc, projects });
  const upd = (i: number, patch: Partial<Doc["projects"][number]>) =>
    setProjects(doc.projects.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-3">
      {doc.projects.map((p, i) => (
        <div key={i} className="rounded-lg border border-border/60 p-2.5">
          <div className="mb-2 flex items-start gap-1.5">
            <input
              value={p.name}
              onChange={(ev) => upd(i, { name: ev.target.value })}
              placeholder="Project name"
              className={cn(INPUT, "font-bold")}
            />
            <button
              type="button"
              onClick={() => setProjects(doc.projects.filter((_, xi) => xi !== i))}
              className={DEL_BTN}
              aria-label="Delete project"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="mb-2">
            <label className={LABEL}>Blurb</label>
            <input
              value={p.blurb ?? ""}
              onChange={(ev) => upd(i, { blurb: ev.target.value || null })}
              className={INPUT}
            />
          </div>
          <BulletsEditor bullets={p.bullets} onChange={(bullets) => upd(i, { bullets })} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setProjects([...doc.projects, { name: "", blurb: null, bullets: [] }])}
        className={ADD_BTN}
      >
        <Plus size={11} />
        Add project
      </button>
    </div>
  );
}

// ── Education ─────────────────────────────────────────────────────────────────

function EducationEditor({ doc, onDoc }: { doc: Doc; onDoc: (d: Doc) => void }) {
  const setEdu = (education: Doc["education"]) => onDoc({ ...doc, education });
  const upd = (i: number, patch: Partial<Doc["education"][number]>) =>
    setEdu(doc.education.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-3">
      {doc.education.map((e, i) => (
        <div key={i} className="rounded-lg border border-border/60 p-2.5">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-[11px] font-bold text-muted-foreground">Entry {i + 1}</p>
            <button
              type="button"
              onClick={() => setEdu(doc.education.filter((_, xi) => xi !== i))}
              className={DEL_BTN}
              aria-label="Delete education entry"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={LABEL}>School</label>
              <input value={e.school} onChange={(ev) => upd(i, { school: ev.target.value })} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Degree</label>
              <input
                value={e.degree ?? ""}
                onChange={(ev) => upd(i, { degree: ev.target.value || null })}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Dates</label>
              <input
                value={e.dates ?? ""}
                onChange={(ev) => upd(i, { dates: ev.target.value || null })}
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Detail</label>
              <input
                value={e.detail ?? ""}
                onChange={(ev) => upd(i, { detail: ev.target.value || null })}
                placeholder="GPA, honors, coursework…"
                className={INPUT}
              />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setEdu([...doc.education, { school: "", degree: null, dates: null, detail: null }])
        }
        className={ADD_BTN}
      >
        <Plus size={11} />
        Add education
      </button>
    </div>
  );
}
