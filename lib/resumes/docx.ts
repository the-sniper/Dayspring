// Render a structured ResumeDoc to an ATS-safe .docx — the most reliably
// parsed format across ATS platforms (Workday, Taleo, iCIMS, ...). Mirrors the
// PDF's structure: single column, real text, standard headings, contact info in
// the body (never in Word headers/footers), no tables/graphics/icons.
//
// Honors the ResumeStyle: section order/visibility, date format, education
// order, skills layout, header alignment, divider, AND the fine sizing knobs
// (font family, per-element sizes, line/section/entry spacing, margins, page
// size) so "Fit to one page" carries over to the Word download. Only the accent
// color is PDF-only — DOCX headings stay high-contrast for ATS safety.
import {
  AlignmentType,
  BorderStyle,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import type { ResumeDocType } from "@/lib/claude/resume";
import {
  DEFAULT_STYLE,
  formatDates,
  visibleSections,
  type ResumeSectionId,
  type ResumeStyle,
} from "@/lib/resumes/style";

const TWIPS_PER_IN = 1440;
const TWIPS_PER_PT = 20;

// Word-native equivalents of the react-pdf built-in fonts.
const FONT_MAP: Record<ResumeStyle["fontFamily"], string> = {
  Helvetica: "Arial",
  "Times-Roman": "Times New Roman",
  Courier: "Courier New",
};

// Page dimensions in twips (portrait).
const PAGE_SIZE: Record<ResumeStyle["pageSize"], { width: number; height: number }> = {
  LETTER: { width: 12240, height: 15840 },
  A4: { width: 11906, height: 16838 },
};

const hp = (pt: number) => Math.round(pt * 2); // points → half-points (font size)
const tw = (pt: number) => Math.round(pt * TWIPS_PER_PT); // points → twips (spacing)

export async function renderResumeDocx(
  doc: ResumeDocType,
  style: ResumeStyle = DEFAULT_STYLE,
): Promise<Buffer> {
  const FONT = FONT_MAP[style.fontFamily];
  const bodyHP = hp(style.bodySize);
  const smallHP = hp(Math.max(7, style.bodySize - 1));
  const nameHP = hp(style.nameSize);
  const headingHP = hp(style.sectionHeaderSize);
  const subHP = hp(style.subHeaderSize);
  const line = Math.round(style.lineSpacing * 240); // 240 = single spacing
  const lineSpacing = { line, lineRule: LineRuleType.AUTO };

  const align =
    style.headerAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  const dates = (d: string) => formatDates(d, style.dateFormat);

  const pageW = PAGE_SIZE[style.pageSize].width;
  const rightTab = Math.round(pageW - 2 * style.marginH * TWIPS_PER_IN);

  function heading(text: string): Paragraph {
    return new Paragraph({
      spacing: { before: tw(style.sectionSpacing), after: tw(4), ...lineSpacing },
      ...(style.hideDivider
        ? {}
        : {
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999" },
            },
          }),
      children: [
        new TextRun({
          text: text.toUpperCase(),
          font: FONT,
          size: headingHP,
          bold: true,
          characterSpacing: 20,
        }),
      ],
    });
  }

  function bullet(text: string): Paragraph {
    return new Paragraph({
      bullet: { level: 0 },
      spacing: { after: tw(1.5), ...lineSpacing },
      children: [new TextRun({ text, font: FONT, size: bodyHP })],
    });
  }

  // Entry header: bold title — detail on the left, dates pushed to a right tab.
  function entryHead(left: string, detail: string | null, d: string | null): Paragraph {
    const children: TextRun[] = [
      new TextRun({ text: left, font: FONT, size: subHP, bold: true }),
    ];
    if (detail) {
      children.push(new TextRun({ text: ` — ${detail}`, font: FONT, size: subHP }));
    }
    if (d) {
      children.push(
        new TextRun({ text: `\t${d}`, font: FONT, size: smallHP, color: "555555" }),
      );
    }
    return new Paragraph({
      spacing: { before: tw(style.entrySpacing), ...lineSpacing },
      tabStops: [{ type: TabStopType.RIGHT, position: rightTab }],
      children,
    });
  }

  const children: Paragraph[] = [];

  // Name + headline + contact — in the body so every ATS sees them.
  children.push(
    new Paragraph({
      alignment: align,
      spacing: lineSpacing,
      children: [new TextRun({ text: doc.name, font: FONT, size: nameHP, bold: true })],
    }),
  );
  if (doc.headline) {
    children.push(
      new Paragraph({
        alignment: align,
        spacing: { before: tw(1), ...lineSpacing },
        children: [
          new TextRun({ text: doc.headline, font: FONT, size: subHP, color: "444444" }),
        ],
      }),
    );
  }
  const contact = [
    doc.contact.email,
    doc.contact.phone,
    doc.contact.location,
    doc.contact.linkedin,
    doc.contact.website,
  ]
    .filter((x): x is string => !!x)
    .join(" · ");
  if (contact) {
    children.push(
      new Paragraph({
        alignment: align,
        spacing: { before: tw(2), ...lineSpacing },
        children: [new TextRun({ text: contact, font: FONT, size: smallHP, color: "333333" })],
      }),
    );
  }

  const sections: Record<ResumeSectionId, () => void> = {
    summary: () => {
      if (!doc.summary) return;
      children.push(heading("Summary"));
      children.push(
        new Paragraph({
          spacing: lineSpacing,
          children: [new TextRun({ text: doc.summary, font: FONT, size: bodyHP })],
        }),
      );
    },
    skills: () => {
      if (!doc.skills.length) return;
      children.push(heading("Skills"));
      if (style.skillsLayout === "list") {
        children.push(
          new Paragraph({
            spacing: { after: tw(1), ...lineSpacing },
            children: [
              new TextRun({
                text: doc.skills.flatMap((g) => g.items).join(", "),
                font: FONT,
                size: bodyHP,
              }),
            ],
          }),
        );
      } else {
        for (const g of doc.skills) {
          children.push(
            new Paragraph({
              spacing: { after: tw(1), ...lineSpacing },
              children: [
                new TextRun({ text: `${g.group}: `, font: FONT, size: bodyHP, bold: true }),
                new TextRun({ text: g.items.join(", "), font: FONT, size: bodyHP }),
              ],
            }),
          );
        }
      }
    },
    experience: () => {
      if (!doc.experience.length) return;
      children.push(heading("Work Experience"));
      for (const e of doc.experience) {
        const detail = `${e.company}${e.location ? `, ${e.location}` : ""}`;
        children.push(entryHead(e.title, detail, dates(e.dates)));
        for (const b of e.bullets) children.push(bullet(b));
      }
    },
    projects: () => {
      if (!doc.projects.length) return;
      children.push(heading("Projects"));
      for (const p of doc.projects) {
        children.push(entryHead(p.name, p.blurb, null));
        for (const b of p.bullets) children.push(bullet(b));
      }
    },
    education: () => {
      if (!doc.education.length) return;
      children.push(heading("Education"));
      for (const e of doc.education) {
        const first = style.educationOrder === "degree-first" ? e.degree : e.school;
        const second = style.educationOrder === "degree-first" ? e.school : e.degree;
        children.push(
          entryHead(first ?? e.school, second ?? null, e.dates ? dates(e.dates) : null),
        );
        if (e.detail) {
          children.push(
            new Paragraph({
              spacing: lineSpacing,
              children: [
                new TextRun({ text: e.detail, font: FONT, size: bodyHP, color: "333333" }),
              ],
            }),
          );
        }
      }
    },
  };
  for (const id of visibleSections(style)) sections[id]();

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: PAGE_SIZE[style.pageSize],
            margin: {
              top: Math.round(style.marginV * TWIPS_PER_IN),
              bottom: Math.round(style.marginV * TWIPS_PER_IN),
              left: Math.round(style.marginH * TWIPS_PER_IN),
              right: Math.round(style.marginH * TWIPS_PER_IN),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}
