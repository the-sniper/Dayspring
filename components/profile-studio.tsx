"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  UserCircle,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Link2,
  Globe,
  Pencil,
  Check,
  X,
  Loader2,
  Sparkles,
  Layers,
  Copy,
  AlertCircle,
  CheckCircle2,
  Briefcase,
  GraduationCap,
  Code2,
  Rocket,
  BadgeCheck,
  ClipboardList,
  FileText,
  Download,
  Star,
  Plus,
} from "lucide-react";
import {
  applyConsolidationAction,
  consolidateAction,
  createProfileAction,
  setDefaultProfileAction,
  updateProfileContentAction,
  updateProfileDefaultsAction,
  updateProfileHeaderAction,
} from "@/lib/actions/profiles";
import type { ConsolidatedDoc } from "@/lib/claude/consolidate";
import type { ApplicationDefaults } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export type ProfileView = {
  id: number;
  name: string;
  isDefault: boolean;
  fullName: string | null;
  headline: string | null;
  summary: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
  content: string;
  doc: ConsolidatedDoc | null;
  defaults: ApplicationDefaults | null;
};

const card = "rounded-2xl border border-border bg-card p-6 shadow-sm";
const btn =
  "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer";
const btnPrimary = cn(btn, "bg-brand-500 text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600");
const btnGhost = cn(btn, "border border-border bg-card text-foreground");
const inputCls =
  "w-full rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function ProfileStudio({
  profiles,
  active,
  mastersCount,
  primaryMaster,
  completeness,
}: {
  profiles: { id: number; name: string; isDefault: boolean }[];
  active: ProfileView;
  mastersCount: number;
  primaryMaster: { id: number; label: string; hasPdf: boolean } | null;
  completeness: number;
}) {
  const [switching, startSwitch] = useTransition();

  return (
    <div className="space-y-6">
      {/* Profile switcher + default */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={active.id}
          disabled={switching}
          onChange={(e) =>
            startSwitch(async () => {
              await setDefaultProfileAction(Number(e.target.value));
              location.reload();
            })
          }
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold cursor-pointer"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? " ✓" : ""}
            </option>
          ))}
        </select>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-tighter text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
          Default — used everywhere
        </span>
        <NewProfileButton />
        {switching && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      </div>

      <HeaderCard active={active} completeness={completeness} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResumeCard mastersCount={mastersCount} primaryMaster={primaryMaster} />
        <ConsolidateCard active={active} mastersCount={mastersCount} />
      </div>

      <SectionCards doc={active.doc} />

      <DefaultsCard active={active} />

      <SourceEditor active={active} />
    </div>
  );
}

function NewProfileButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const name = prompt("Name the new profile (it starts as a copy of this one):");
        if (!name?.trim()) return;
        startTransition(async () => {
          const res = await createProfileAction(name);
          if (res.ok) location.reload();
        });
      }}
      className="flex items-center gap-1 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-brand-600 hover:border-brand-500/40 transition-colors cursor-pointer"
    >
      {pending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
      New profile
    </button>
  );
}

// ── Header: identity + contact + completeness ─────────────────────────────────
function HeaderCard({ active, completeness }: { active: ProfileView; completeness: number }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({
    fullName: active.fullName ?? "",
    headline: active.headline ?? "",
    summary: active.summary ?? "",
    email: active.email ?? "",
    phone: active.phone ?? "",
    location: active.location ?? "",
    linkedin: active.linkedin ?? "",
    github: active.github ?? "",
    website: active.website ?? "",
  });

  function save() {
    startTransition(async () => {
      const res = await updateProfileHeaderAction(active.id, f);
      if (res.ok) location.reload();
    });
  }

  const chip =
    "inline-flex items-center gap-1.5 rounded-lg bg-secondary/40 px-2.5 py-1 text-xs font-medium text-muted-foreground";

  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {!editing ? (
            <>
              <h2 className="text-2xl font-black tracking-tight text-foreground">
                {active.fullName ?? "Add your name"}
              </h2>
              {active.headline && (
                <p className="text-sm font-bold text-muted-foreground">{active.headline}</p>
              )}
              {active.summary ? (
                <p className="mt-2 max-w-2xl text-sm font-medium text-muted-foreground leading-relaxed">
                  {active.summary}
                </p>
              ) : (
                <p className="mt-2 text-sm italic text-muted-foreground/60">
                  Add a 1–2 line summary about yourself…
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {active.location && (
                  <span className={chip}>
                    <MapPin size={12} /> {active.location}
                  </span>
                )}
                {active.email && (
                  <span className={chip}>
                    <Mail size={12} /> {active.email}
                  </span>
                )}
                {active.phone && (
                  <span className={chip}>
                    <Phone size={12} /> {active.phone}
                  </span>
                )}
                {active.linkedin && (
                  <a href={active.linkedin.startsWith("http") ? active.linkedin : `https://${active.linkedin}`} target="_blank" rel="noreferrer" className={cn(chip, "hover:text-brand-600")}>
                    <ExternalLink size={12} /> LinkedIn
                  </a>
                )}
                {active.github && (
                  <a href={active.github.startsWith("http") ? active.github : `https://${active.github}`} target="_blank" rel="noreferrer" className={cn(chip, "hover:text-brand-600")}>
                    <Link2 size={12} /> GitHub
                  </a>
                )}
                {active.website && (
                  <a href={active.website.startsWith("http") ? active.website : `https://${active.website}`} target="_blank" rel="noreferrer" className={cn(chip, "hover:text-brand-600")}>
                    <Globe size={12} /> Website
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ["fullName", "Full name"],
                  ["headline", "Headline"],
                  ["email", "Email"],
                  ["phone", "Phone"],
                  ["location", "Location"],
                  ["linkedin", "LinkedIn URL"],
                  ["github", "GitHub URL"],
                  ["website", "Website URL"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </span>
                  <input
                    value={f[key]}
                    onChange={(e) => setF({ ...f, [key]: e.target.value })}
                    className={inputCls}
                  />
                </label>
              ))}
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Summary (1–2 lines)
                </span>
                <textarea
                  value={f.summary}
                  onChange={(e) => setF({ ...f, summary: e.target.value })}
                  rows={2}
                  className={inputCls}
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-brand-500/80 text-sm font-black text-foreground"
            title="Profile completeness"
          >
            {completeness}%
          </div>
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)} className={cn(btnGhost, "px-3 py-1.5 text-xs")}>
              <Pencil size={12} /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={save} className={cn(btnPrimary, "px-3 py-1.5 text-xs")}>
                {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className={cn(btnGhost, "px-3 py-1.5 text-xs")}>
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Resume card ───────────────────────────────────────────────────────────────
function ResumeCard({
  mastersCount,
  primaryMaster,
}: {
  mastersCount: number;
  primaryMaster: { id: number; label: string; hasPdf: boolean } | null;
}) {
  return (
    <section className={card}>
      <div className="mb-2 flex items-center gap-2">
        <FileText size={16} className="text-brand-500" />
        <h3 className="text-sm font-bold text-foreground">Resume</h3>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-muted-foreground">
          {mastersCount} master{mastersCount === 1 ? "" : "s"}
        </span>
      </div>
      {primaryMaster ? (
        <>
          <p className="text-xs font-medium text-muted-foreground leading-relaxed">
            <Star size={11} className="inline -mt-0.5 mr-1 text-amber-500" />
            Default: <span className="font-bold text-foreground">{primaryMaster.label}</span> — attached
            when a job has no tailored resume; every job can generate its own tailored PDF.
          </p>
          <div className="mt-3 flex gap-2">
            {primaryMaster.hasPdf && (
              <a href={`/api/masters/${primaryMaster.id}`} target="_blank" rel="noreferrer" className={cn(btnGhost, "px-3 py-1.5 text-xs")}>
                <Download size={12} /> Download
              </a>
            )}
            <Link href="/settings" className={cn(btnGhost, "px-3 py-1.5 text-xs")}>
              Manage masters
            </Link>
          </div>
        </>
      ) : (
        <p className="text-xs font-medium text-muted-foreground">
          No master resume yet —{" "}
          <Link href="/settings" className="font-bold text-brand-600 hover:underline">
            upload one in Settings
          </Link>
          .
        </p>
      )}
    </section>
  );
}

// ── Consolidation ─────────────────────────────────────────────────────────────
function ConsolidateCard({ active, mastersCount }: { active: ProfileView; mastersCount: number }) {
  const [result, setResult] = useState<{ doc: ConsolidatedDoc; markdown: string; sources: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [running, startRun] = useTransition();
  const [applying, startApply] = useTransition();

  function run() {
    setError(null);
    setApplied(false);
    setResult(null);
    startRun(async () => {
      const res = await consolidateAction();
      if (res.ok) setResult({ doc: res.doc, markdown: res.markdown, sources: res.sources });
      else setError(res.error);
    });
  }

  function apply() {
    if (!result) return;
    startApply(async () => {
      const res = await applyConsolidationAction(active.id, result.doc);
      if (res.ok) {
        setApplied(true);
        setTimeout(() => location.reload(), 800);
      } else setError(res.error);
    });
  }

  return (
    <section className={card}>
      <div className="mb-2 flex items-center gap-2">
        <Layers size={16} className="text-brand-500" />
        <h3 className="text-sm font-bold text-foreground">Consolidated view</h3>
      </div>
      <p className="text-xs font-medium text-muted-foreground leading-relaxed">
        Merge <span className="font-bold text-foreground">all {mastersCount} master resume{mastersCount === 1 ? "" : "s"}</span> into
        one canonical document — the union of your truthful material, deduped, nothing invented.
        Preview it, then apply it to this profile (or copy and paste it anywhere).
      </p>
      <button type="button" disabled={running || mastersCount === 0} onClick={run} className={cn(btnPrimary, "mt-3")}>
        {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {running ? "Consolidating…" : "Consolidate resumes"}
      </button>
      {running && (
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">
          Opus is merging every version — ~30–60s.
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-start gap-2 text-xs font-medium text-destructive">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {result && (
        <div className="mt-4 space-y-3">
          {result.doc.merge_notes.length > 0 && (
            <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 p-3 text-[11px] font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              <p className="font-bold mb-1">Merge notes:</p>
              {result.doc.merge_notes.map((n) => (
                <p key={n}>· {n}</p>
              ))}
            </div>
          )}
          <textarea
            readOnly
            value={result.markdown}
            rows={12}
            className="w-full rounded-xl border border-border bg-secondary/20 p-3 font-mono text-[11px] leading-relaxed"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={applying || applied} onClick={apply} className={btnPrimary}>
              {applying ? <Loader2 size={16} className="animate-spin" /> : applied ? <CheckCircle2 size={16} /> : <Check size={16} strokeWidth={3} />}
              {applied ? "Applied ✓" : `Apply to “${active.name}”`}
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(result.markdown);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className={btnGhost}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy markdown"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Structured section cards (from the consolidated doc) ─────────────────────
function SectionCards({ doc }: { doc: ConsolidatedDoc | null }) {
  if (!doc) {
    return (
      <section className={cn(card, "border-2 border-dashed bg-transparent shadow-none text-center")}>
        <p className="text-sm font-medium text-muted-foreground">
          Run <span className="font-bold text-foreground">Consolidate resumes</span> and apply it to
          build the structured Experience / Skills / Projects view.
        </p>
      </section>
    );
  }
  return (
    <>
      <section className={card}>
        <div className="mb-4 flex items-center gap-2">
          <Briefcase size={16} className="text-brand-500" />
          <h3 className="text-sm font-bold text-foreground">Experience</h3>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {doc.experience.length} role{doc.experience.length === 1 ? "" : "s"}
          </span>
        </div>
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
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className={card}>
          <div className="mb-4 flex items-center gap-2">
            <Code2 size={16} className="text-brand-500" />
            <h3 className="text-sm font-bold text-foreground">Skills</h3>
          </div>
          <div className="space-y-3">
            {doc.skills.map((g) => (
              <div key={g.group}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {g.group}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((s) => (
                    <span key={s} className="rounded-lg bg-secondary/50 px-2 py-0.5 text-xs font-bold text-foreground">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className={card}>
            <div className="mb-3 flex items-center gap-2">
              <GraduationCap size={16} className="text-brand-500" />
              <h3 className="text-sm font-bold text-foreground">Education</h3>
            </div>
            {doc.education.map((e) => (
              <div key={e.school} className="mb-2 last:mb-0">
                <p className="text-sm font-bold text-foreground">{e.school}</p>
                <p className="text-xs font-medium text-muted-foreground">
                  {[e.degree, e.dates, e.detail].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}
          </section>

          <section className={card}>
            <div className="mb-3 flex items-center gap-2">
              <BadgeCheck size={16} className="text-brand-500" />
              <h3 className="text-sm font-bold text-foreground">Certifications</h3>
            </div>
            {doc.certifications.length ? (
              doc.certifications.map((c) => (
                <p key={c} className="text-xs font-medium text-muted-foreground">
                  · {c}
                </p>
              ))
            ) : (
              <p className="text-xs italic text-muted-foreground/60">None on file.</p>
            )}
          </section>
        </div>
      </div>

      {doc.projects.length > 0 && (
        <section className={card}>
          <div className="mb-4 flex items-center gap-2">
            <Rocket size={16} className="text-brand-500" />
            <h3 className="text-sm font-bold text-foreground">Projects</h3>
          </div>
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
        </section>
      )}
    </>
  );
}

// ── Application defaults ──────────────────────────────────────────────────────
type TriKey = Exclude<keyof ApplicationDefaults, "visaType" | "gender" | "ethnicity">;

// Hoisted (stable component types): defining these inside DefaultsCard would
// remount the fields on every keystroke and drop focus/state.
function Tri({
  label,
  k,
  d,
  setD,
}: {
  label: string;
  k: TriKey;
  d: ApplicationDefaults;
  setD: (d: ApplicationDefaults) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        value={d[k] === null ? "" : d[k] ? "yes" : "no"}
        onChange={(e) =>
          setD({ ...d, [k]: e.target.value === "" ? null : e.target.value === "yes" })
        }
        className={cn(inputCls, "cursor-pointer")}
      >
        <option value="">— I&apos;ll answer on the page</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

function Txt({
  label,
  k,
  placeholder,
  d,
  setD,
}: {
  label: string;
  k: "visaType" | "gender" | "ethnicity";
  placeholder: string;
  d: ApplicationDefaults;
  setD: (d: ApplicationDefaults) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        value={d[k] ?? ""}
        placeholder={placeholder}
        onChange={(e) => setD({ ...d, [k]: e.target.value.trim() || null })}
        className={inputCls}
      />
    </label>
  );
}

function DefaultsCard({ active }: { active: ProfileView }) {
  const [d, setD] = useState<ApplicationDefaults>(
    active.defaults ?? {
      visaType: null,
      authorizedToWork: null,
      needsSponsorship: null,
      inPersonOk: null,
      canRelocate: null,
      startImmediately: null,
      gender: null,
      ethnicity: null,
      veteran: null,
      disability: null,
    },
  );
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateProfileDefaultsAction(active.id, d);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <section className={card}>
      <div className="mb-2 flex items-center gap-2">
        <ClipboardList size={16} className="text-brand-500" />
        <h3 className="text-sm font-bold text-foreground">Application defaults</h3>
      </div>
      <p className="mb-4 text-xs font-medium text-muted-foreground leading-relaxed">
        What apply-assist fills on every form.{" "}
        <span className="font-bold text-foreground">Only answers you set here are ever
        filled</span> — anything left as &ldquo;I&apos;ll answer on the page&rdquo; stays blank for
        you at the review step. Self-ID questions are always voluntary.
      </p>

      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Work authorization</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Txt label="Visa type" k="visaType" placeholder="e.g. OPT, H-1B, Citizen" d={d} setD={setD} />
        <Tri label="Authorized to work (US)" k="authorizedToWork" d={d} setD={setD} />
        <Tri label="Needs sponsorship" k="needsSponsorship" d={d} setD={setD} />
      </div>

      <p className="mt-4 mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Work preferences</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tri label="In-person OK" k="inPersonOk" d={d} setD={setD} />
        <Tri label="Can relocate" k="canRelocate" d={d} setD={setD} />
        <Tri label="Start immediately" k="startImmediately" d={d} setD={setD} />
      </div>

      <p className="mt-4 mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Voluntary self-identification</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Txt label="Gender" k="gender" placeholder="as you'd answer" d={d} setD={setD} />
        <Txt label="Ethnicity" k="ethnicity" placeholder="as you'd answer" d={d} setD={setD} />
        <Tri label="Veteran" k="veteran" d={d} setD={setD} />
        <Tri label="Disability" k="disability" d={d} setD={setD} />
      </div>

      <button type="button" disabled={pending} onClick={save} className={cn(btnPrimary, "mt-4")}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Check size={16} strokeWidth={3} />}
        {saved ? "Saved ✓" : "Save defaults"}
      </button>
    </section>
  );
}

// ── Source text (the corpus scoring/tailoring read) ──────────────────────────
function SourceEditor({ active }: { active: ProfileView }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(active.content);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCircle size={16} className="text-brand-500" />
          <h3 className="text-sm font-bold text-foreground">Source text</h3>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            what scoring &amp; tailoring read
          </span>
        </div>
        <button type="button" onClick={() => setOpen(!open)} className={cn(btnGhost, "px-3 py-1.5 text-xs")}>
          {open ? "Close" : "View & edit"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            spellCheck={false}
            className="w-full rounded-xl border border-border bg-secondary/20 p-3 font-mono text-[11px] leading-relaxed transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="button"
            disabled={pending || draft.trim() === active.content.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await updateProfileContentAction(active.id, draft);
                if (res.ok) {
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                }
              })
            }
            className={cn(btnPrimary, "px-3 py-2 text-xs")}
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : saved ? <CheckCircle2 size={13} /> : <Check size={13} strokeWidth={3} />}
            {saved ? "Saved ✓" : "Save source text"}
          </button>
        </div>
      )}
    </section>
  );
}
