// ResumeStyle — every visual knob the resume studio exposes. Shared by the
// react-pdf template (client preview + server render) and the DOCX renderer
// (which honors the structural options: section order/visibility, date format,
// education order, skills layout). Pure data + string helpers — safe to import
// from client and server code alike.

export type ResumeTemplateId = "standard" | "compact" | "centered";
export type ResumePageSize = "LETTER" | "A4";
export type ResumeFontFamily = "Helvetica" | "Times-Roman" | "Courier";
export type ResumeDateFormat = "mon-yyyy" | "mm-yyyy";
export type ResumeBulletIcon = "dot" | "dash";
export type ResumeHeaderAlign = "left" | "center";
export type ResumeAccentScope = "headings" | "name-and-headings" | "none";
export type ResumeEducationOrder = "school-first" | "degree-first";
export type ResumeSkillsLayout = "grouped" | "list";

export const SECTION_IDS = [
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
] as const;
export type ResumeSectionId = (typeof SECTION_IDS)[number];

export const SECTION_LABELS: Record<ResumeSectionId, string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Work Experience",
  projects: "Projects",
  education: "Education",
};

export type ResumeStyle = {
  template: ResumeTemplateId;
  pageSize: ResumePageSize;
  fontFamily: ResumeFontFamily;
  // Point sizes per element.
  nameSize: number;
  sectionHeaderSize: number;
  subHeaderSize: number;
  bodySize: number;
  accentColor: string; // hex
  accentScope: ResumeAccentScope;
  dateFormat: ResumeDateFormat;
  bulletIcon: ResumeBulletIcon;
  hideDivider: boolean;
  headerAlign: ResumeHeaderAlign;
  educationOrder: ResumeEducationOrder;
  skillsLayout: ResumeSkillsLayout;
  // Spacing, in points (lineSpacing is a multiplier).
  sectionSpacing: number;
  entrySpacing: number;
  lineSpacing: number;
  marginV: number; // inches
  marginH: number; // inches
  sectionOrder: ResumeSectionId[];
  hiddenSections: ResumeSectionId[];
};

export const DEFAULT_STYLE: ResumeStyle = {
  template: "standard",
  pageSize: "LETTER",
  fontFamily: "Helvetica",
  nameSize: 19,
  sectionHeaderSize: 9,
  subHeaderSize: 9.8,
  bodySize: 9.8,
  accentColor: "#1a1a1a",
  accentScope: "headings",
  dateFormat: "mon-yyyy",
  bulletIcon: "dot",
  hideDivider: false,
  headerAlign: "left",
  educationOrder: "school-first",
  skillsLayout: "grouped",
  sectionSpacing: 10,
  entrySpacing: 6,
  lineSpacing: 1.38,
  marginV: 0.55,
  marginH: 0.6,
  sectionOrder: [...SECTION_IDS],
  hiddenSections: [],
};

// Template presets tweak the defaults; everything stays user-overridable.
export function stylePreset(template: ResumeTemplateId): ResumeStyle {
  const base: ResumeStyle = { ...DEFAULT_STYLE, sectionOrder: [...SECTION_IDS], hiddenSections: [], template };
  if (template === "compact") {
    return {
      ...base,
      nameSize: 16,
      subHeaderSize: 9.2,
      bodySize: 9.2,
      sectionSpacing: 7,
      entrySpacing: 4,
      lineSpacing: 1.28,
      marginV: 0.45,
      marginH: 0.5,
    };
  }
  if (template === "centered") {
    return { ...base, headerAlign: "center", accentScope: "name-and-headings" };
  }
  return base;
}

// Merge a stored (possibly partial / older-shape) style JSON with defaults.
export function normalizeStyle(raw: unknown): ResumeStyle {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STYLE };
  const s = { ...DEFAULT_STYLE, ...(raw as Partial<ResumeStyle>) };
  const order = Array.isArray(s.sectionOrder)
    ? s.sectionOrder.filter((x): x is ResumeSectionId => (SECTION_IDS as readonly string[]).includes(x))
    : [];
  for (const id of SECTION_IDS) if (!order.includes(id)) order.push(id);
  s.sectionOrder = order;
  s.hiddenSections = Array.isArray(s.hiddenSections)
    ? s.hiddenSections.filter((x): x is ResumeSectionId => (SECTION_IDS as readonly string[]).includes(x))
    : [];
  return s;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/gi;

// Re-format "Mon YYYY" style dates per the chosen format. Values are already
// normalized by the generator; this is presentation only.
export function formatDates(dates: string, fmt: ResumeDateFormat): string {
  if (fmt === "mon-yyyy") return dates;
  return dates.replace(MONTH_RE, (_m, mon: string, year: string) => {
    const mm = MONTHS[mon.toLowerCase().slice(0, 3)];
    return mm ? `${mm}/${year}` : _m;
  });
}

// Which sections render, in order.
export function visibleSections(style: ResumeStyle): ResumeSectionId[] {
  return style.sectionOrder.filter((s) => !style.hiddenSections.includes(s));
}
