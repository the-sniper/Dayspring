"use client";

// Style tab — every ResumeStyle knob: template presets, page size, fonts and
// per-element sizes, accent color + scope, date format, bullet icon, divider,
// header alignment, education order, skills layout, spacing/margin sliders,
// and a full reset. Fine styling applies to the PDF; the DOCX keeps the
// structural options (order, visibility, date format, layouts).
import { RotateCcw } from "lucide-react";
import {
  DEFAULT_STYLE,
  stylePreset,
  type ResumeFontFamily,
  type ResumeStyle,
  type ResumeTemplateId,
} from "@/lib/resumes/style";
import { cn } from "@/lib/utils";

const ACCENTS = [
  "#1a1a1a",
  "#b45309",
  "#0f766e",
  "#1d4ed8",
  "#7c3aed",
  "#be123c",
  "#166534",
];

const GROUP = "space-y-2";
const HEADING =
  "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 px-2 py-1.5 text-[11px] font-bold transition-colors cursor-pointer",
            i > 0 && "border-l border-border",
            value === o.value
              ? "bg-brand-500 text-white"
              : "bg-secondary/20 text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold text-foreground">{label}</span>
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-[var(--brand-500,#b45309)]"
      />
    </div>
  );
}

export default function StyleTab({
  style,
  onStyle,
}: {
  style: ResumeStyle;
  onStyle: (s: ResumeStyle) => void;
}) {
  const set = (patch: Partial<ResumeStyle>) => onStyle({ ...style, ...patch });

  return (
    <div className="space-y-5 p-4">
      {/* Template */}
      <div className={GROUP}>
        <p className={HEADING}>Template</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["standard", "Standard"],
              ["compact", "Compact"],
              ["centered", "Centered"],
            ] as [ResumeTemplateId, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                // Presets reset the visual knobs but keep the user's section
                // order/visibility — those are content decisions.
                onStyle({
                  ...stylePreset(id),
                  sectionOrder: style.sectionOrder,
                  hiddenSections: style.hiddenSections,
                })
              }
              className={cn(
                "rounded-xl border p-2 text-left transition-all cursor-pointer",
                style.template === id
                  ? "border-brand-500 ring-1 ring-brand-500/30"
                  : "border-border hover:border-brand-500/40",
              )}
            >
              {/* Mini layout thumbnail */}
              <div className="mb-1.5 h-14 rounded-md bg-secondary/40 p-1.5">
                <div
                  className={cn(
                    "h-1.5 w-8 rounded-sm bg-foreground/60",
                    id === "centered" && "mx-auto",
                  )}
                />
                <div
                  className={cn(
                    "mt-1 h-1 w-12 rounded-sm bg-foreground/25",
                    id === "centered" && "mx-auto",
                  )}
                />
                <div className="mt-1.5 space-y-[3px]">
                  {Array.from({ length: id === "compact" ? 4 : 3 }).map((_, i) => (
                    <div key={i} className="h-[3px] w-full rounded-sm bg-foreground/15" />
                  ))}
                </div>
              </div>
              <span className="text-[11px] font-bold text-foreground">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Page + font */}
      <div className={GROUP}>
        <p className={HEADING}>Page size</p>
        <Seg
          value={style.pageSize}
          options={[
            { value: "LETTER", label: "Letter (US)" },
            { value: "A4", label: "A4" },
          ]}
          onChange={(pageSize) => set({ pageSize })}
        />
      </div>

      <div className={GROUP}>
        <p className={HEADING}>Font</p>
        <Seg<ResumeFontFamily>
          value={style.fontFamily}
          options={[
            { value: "Helvetica", label: "Helvetica" },
            { value: "Times-Roman", label: "Times" },
            { value: "Courier", label: "Courier" },
          ]}
          onChange={(fontFamily) => set({ fontFamily })}
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
          <Slider label="Name" value={style.nameSize} min={14} max={26} step={0.5} format={(v) => `${v}pt`} onChange={(nameSize) => set({ nameSize })} />
          <Slider label="Section headers" value={style.sectionHeaderSize} min={7} max={13} step={0.5} format={(v) => `${v}pt`} onChange={(sectionHeaderSize) => set({ sectionHeaderSize })} />
          <Slider label="Sub-headers" value={style.subHeaderSize} min={8} max={13} step={0.2} format={(v) => `${v}pt`} onChange={(subHeaderSize) => set({ subHeaderSize })} />
          <Slider label="Body" value={style.bodySize} min={8} max={12} step={0.2} format={(v) => `${v}pt`} onChange={(bodySize) => set({ bodySize })} />
        </div>
      </div>

      {/* Accent */}
      <div className={GROUP}>
        <p className={HEADING}>Accent color</p>
        <div className="flex items-center gap-1.5">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set({ accentColor: c })}
              style={{ backgroundColor: c }}
              className={cn(
                "h-6 w-6 rounded-full transition-transform hover:scale-110 cursor-pointer",
                style.accentColor === c && "ring-2 ring-brand-500 ring-offset-2 ring-offset-card",
              )}
              aria-label={`Accent ${c}`}
            />
          ))}
          <input
            type="color"
            value={style.accentColor}
            onChange={(e) => set({ accentColor: e.target.value })}
            className="h-6 w-6 cursor-pointer rounded-md border border-border bg-transparent p-0"
            aria-label="Custom accent color"
          />
        </div>
        <Seg
          value={style.accentScope}
          options={[
            { value: "headings", label: "Headings" },
            { value: "name-and-headings", label: "Name + headings" },
            { value: "none", label: "Off" },
          ]}
          onChange={(accentScope) => set({ accentScope })}
        />
      </div>

      {/* Format options */}
      <div className={GROUP}>
        <p className={HEADING}>Dates</p>
        <Seg
          value={style.dateFormat}
          options={[
            { value: "mon-yyyy", label: "Jan 2024" },
            { value: "mm-yyyy", label: "01/2024" },
          ]}
          onChange={(dateFormat) => set({ dateFormat })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={GROUP}>
          <p className={HEADING}>Bullet icon</p>
          <Seg
            value={style.bulletIcon}
            options={[
              { value: "dot", label: "• Dot" },
              { value: "dash", label: "– Dash" },
            ]}
            onChange={(bulletIcon) => set({ bulletIcon })}
          />
        </div>
        <div className={GROUP}>
          <p className={HEADING}>Header dividers</p>
          <Seg
            value={style.hideDivider ? "hide" : "show"}
            options={[
              { value: "show", label: "Show" },
              { value: "hide", label: "Hide" },
            ]}
            onChange={(v) => set({ hideDivider: v === "hide" })}
          />
        </div>
        <div className={GROUP}>
          <p className={HEADING}>Header alignment</p>
          <Seg
            value={style.headerAlign}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
            ]}
            onChange={(headerAlign) => set({ headerAlign })}
          />
        </div>
        <div className={GROUP}>
          <p className={HEADING}>Education order</p>
          <Seg
            value={style.educationOrder}
            options={[
              { value: "school-first", label: "School first" },
              { value: "degree-first", label: "Degree first" },
            ]}
            onChange={(educationOrder) => set({ educationOrder })}
          />
        </div>
      </div>

      <div className={GROUP}>
        <p className={HEADING}>Skills layout</p>
        <Seg
          value={style.skillsLayout}
          options={[
            { value: "grouped", label: "Grouped (Label: a, b, c)" },
            { value: "list", label: "Single list" },
          ]}
          onChange={(skillsLayout) => set({ skillsLayout })}
        />
      </div>

      {/* Spacing */}
      <div className={GROUP}>
        <p className={HEADING}>Spacing</p>
        <div className="space-y-3">
          <Slider label="Section spacing" value={style.sectionSpacing} min={4} max={20} step={1} format={(v) => `${v}pt`} onChange={(sectionSpacing) => set({ sectionSpacing })} />
          <Slider label="Entry spacing" value={style.entrySpacing} min={2} max={14} step={0.5} format={(v) => `${v}pt`} onChange={(entrySpacing) => set({ entrySpacing })} />
          <Slider label="Line spacing" value={style.lineSpacing} min={1.1} max={1.7} step={0.02} format={(v) => `${v.toFixed(2)}×`} onChange={(lineSpacing) => set({ lineSpacing })} />
          <Slider label="Vertical margins" value={style.marginV} min={0.3} max={1} step={0.05} format={(v) => `${v.toFixed(2)}″`} onChange={(marginV) => set({ marginV })} />
          <Slider label="Horizontal margins" value={style.marginH} min={0.4} max={1.1} step={0.05} format={(v) => `${v.toFixed(2)}″`} onChange={(marginH) => set({ marginH })} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onStyle({ ...DEFAULT_STYLE, sectionOrder: [...DEFAULT_STYLE.sectionOrder] })}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-brand-500/40 hover:text-brand-600 cursor-pointer"
      >
        <RotateCcw size={12} />
        Reset formatting
      </button>

      <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
        Font, sizes, spacing, margins, and page size carry over to both the PDF
        and the DOCX — so &ldquo;Fit to one page&rdquo; applies to your Word
        download too. Only the accent color is PDF-only (DOCX headings stay
        high-contrast for ATS safety).
      </p>
    </div>
  );
}
