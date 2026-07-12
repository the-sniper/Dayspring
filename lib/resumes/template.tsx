// The single source of truth for resume PDF layout — a @react-pdf/renderer
// Document driven by (doc, style, highlights). The studio renders it client-side
// for the live preview; the server renders the exact same component to a buffer
// for saved PDFs, so preview and download are pixel-identical.
//
// ATS rules baked in regardless of style knobs: single column, real text,
// standard section headers, contact in the body, no graphics/photos/tables.
import * as React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { ResumeDocType } from "@/lib/claude/resume";
import type { AuditHighlights, AuditStatus } from "@/lib/resumes/audit-types";
import {
  formatDates,
  visibleSections,
  type ResumeSectionId,
  type ResumeStyle,
} from "@/lib/resumes/style";

const BOLD: Record<ResumeStyle["fontFamily"], string> = {
  Helvetica: "Helvetica-Bold",
  "Times-Roman": "Times-Bold",
  Courier: "Courier-Bold",
};

const HIGHLIGHT_BG: Record<Exclude<AuditStatus, "supported">, string> = {
  adjusted: "#d3f2df", // green — honest rephrase / JD vocabulary
  unsupported: "#fcdcdc", // red — fabrication risk
};

function highlightStyle(
  text: string | null | undefined,
  highlights: AuditHighlights | undefined,
  showChanges: boolean,
): Style | undefined {
  if (!showChanges || !highlights || !text) return undefined;
  const status = highlights[text.trim()];
  if (status === "adjusted" || status === "unsupported") {
    return { backgroundColor: HIGHLIGHT_BG[status] };
  }
  return undefined;
}

export function ResumePdf({
  doc,
  style,
  highlights,
  showChanges = false,
}: {
  doc: ResumeDocType;
  style: ResumeStyle;
  highlights?: AuditHighlights;
  showChanges?: boolean;
}) {
  const bold = BOLD[style.fontFamily];
  const accentHead = style.accentScope !== "none" ? style.accentColor : "#1a1a1a";
  const accentName =
    style.accentScope === "name-and-headings" ? style.accentColor : "#1a1a1a";

  const s = {
    page: {
      fontFamily: style.fontFamily,
      fontSize: style.bodySize,
      lineHeight: style.lineSpacing,
      color: "#1a1a1a",
      paddingVertical: style.marginV * 72,
      paddingHorizontal: style.marginH * 72,
    } as Style,
    name: {
      fontFamily: bold,
      fontSize: style.nameSize,
      color: accentName,
      textAlign: style.headerAlign,
      lineHeight: 1.15,
    } as Style,
    headline: {
      fontSize: style.subHeaderSize + 0.7,
      color: "#444444",
      marginTop: 2,
      textAlign: style.headerAlign,
    } as Style,
    contact: {
      fontSize: style.bodySize - 1,
      color: "#333333",
      marginTop: 3,
      textAlign: style.headerAlign,
    } as Style,
    h2: {
      fontFamily: bold,
      fontSize: style.sectionHeaderSize,
      color: accentHead,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginTop: style.sectionSpacing,
      marginBottom: 4,
      paddingBottom: 2,
      ...(style.hideDivider
        ? {}
        : { borderBottomWidth: 0.7, borderBottomColor: "#999999" }),
    } as Style,
    entry: { marginBottom: style.entrySpacing } as Style,
    entryHead: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
    } as Style,
    entryTitle: { fontFamily: bold, fontSize: style.subHeaderSize } as Style,
    entryDetail: { fontSize: style.subHeaderSize, color: "#333333" } as Style,
    dates: {
      fontSize: style.bodySize - 1,
      color: "#555555",
      marginLeft: 8,
      flexShrink: 0,
    } as Style,
    bulletRow: { flexDirection: "row", marginTop: 1.5 } as Style,
    bulletGlyph: { width: 10, flexShrink: 0 } as Style,
    bulletText: { flex: 1 } as Style,
    skillLine: { marginTop: 1 } as Style,
    muted: { color: "#333333" } as Style,
  };

  const glyph = style.bulletIcon === "dash" ? "–" : "•";
  const hl = (text: string | null | undefined) =>
    highlightStyle(text, highlights, showChanges);

  function Bullet({ text }: { text: string }) {
    return (
      <View style={s.bulletRow}>
        <Text style={s.bulletGlyph}>{glyph}</Text>
        <Text style={[s.bulletText, hl(text) ?? {}]}>{text}</Text>
      </View>
    );
  }

  const sections: Record<ResumeSectionId, React.ReactNode> = {
    summary: doc.summary ? (
      <View key="summary">
        <Text style={s.h2}>Summary</Text>
        <Text style={hl(doc.summary)}>{doc.summary}</Text>
      </View>
    ) : null,

    skills:
      doc.skills.length > 0 ? (
        <View key="skills">
          <Text style={s.h2}>Skills</Text>
          {style.skillsLayout === "list" ? (
            <Text style={s.skillLine}>
              {doc.skills.flatMap((g) => g.items).map((item, i, all) => (
                <Text key={`${item}-${i}`} style={hl(item)}>
                  {item}
                  {i < all.length - 1 ? ", " : ""}
                </Text>
              ))}
            </Text>
          ) : (
            doc.skills.map((g, gi) => (
              <Text key={`${g.group}-${gi}`} style={s.skillLine}>
                <Text style={{ fontFamily: bold }}>{g.group}: </Text>
                {g.items.map((item, i) => (
                  <Text key={`${item}-${i}`} style={hl(item)}>
                    {item}
                    {i < g.items.length - 1 ? ", " : ""}
                  </Text>
                ))}
              </Text>
            ))
          )}
        </View>
      ) : null,

    experience:
      doc.experience.length > 0 ? (
        <View key="experience">
          <Text style={s.h2}>Work Experience</Text>
          {doc.experience.map((e, i) => (
            <View key={`${e.company}-${i}`} style={s.entry} wrap={false}>
              <View style={s.entryHead}>
                <Text style={{ flexShrink: 1 }}>
                  <Text style={s.entryTitle}>{e.title}</Text>
                  <Text style={s.entryDetail}>
                    {" "}— {e.company}
                    {e.location ? `, ${e.location}` : ""}
                  </Text>
                </Text>
                <Text style={[s.dates, hl(e.dates) ?? {}]}>
                  {formatDates(e.dates, style.dateFormat)}
                </Text>
              </View>
              {e.bullets.map((b, bi) => (
                <Bullet key={bi} text={b} />
              ))}
            </View>
          ))}
        </View>
      ) : null,

    projects:
      doc.projects.length > 0 ? (
        <View key="projects">
          <Text style={s.h2}>Projects</Text>
          {doc.projects.map((p, i) => (
            <View key={`${p.name}-${i}`} style={s.entry} wrap={false}>
              <Text>
                <Text style={s.entryTitle}>{p.name}</Text>
                {p.blurb ? (
                  <Text style={[s.entryDetail, hl(p.blurb) ?? {}]}> — {p.blurb}</Text>
                ) : null}
              </Text>
              {p.bullets.map((b, bi) => (
                <Bullet key={bi} text={b} />
              ))}
            </View>
          ))}
        </View>
      ) : null,

    education:
      doc.education.length > 0 ? (
        <View key="education">
          <Text style={s.h2}>Education</Text>
          {doc.education.map((e, i) => {
            const first = style.educationOrder === "degree-first" ? e.degree : e.school;
            const second = style.educationOrder === "degree-first" ? e.school : e.degree;
            return (
              <View key={`${e.school}-${i}`} style={s.entry} wrap={false}>
                <View style={s.entryHead}>
                  <Text style={{ flexShrink: 1 }}>
                    <Text style={s.entryTitle}>{first ?? e.school}</Text>
                    {second ? <Text style={s.entryDetail}> — {second}</Text> : null}
                  </Text>
                  {e.dates ? (
                    <Text style={s.dates}>{formatDates(e.dates, style.dateFormat)}</Text>
                  ) : null}
                </View>
                {e.detail ? (
                  <Text style={[s.muted, { marginTop: 1 }, hl(e.detail) ?? {}]}>
                    {e.detail}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null,
  };

  const contact = [
    doc.contact.email,
    doc.contact.phone,
    doc.contact.location,
    doc.contact.linkedin,
    doc.contact.website,
  ].filter((x): x is string => !!x);

  return (
    <Document title={doc.name} author={doc.name}>
      <Page size={style.pageSize} style={s.page}>
        <Text style={s.name}>{doc.name}</Text>
        {doc.headline ? (
          <Text style={[s.headline, hl(doc.headline) ?? {}]}>{doc.headline}</Text>
        ) : null}
        {contact.length > 0 ? (
          <Text style={s.contact}>{contact.join("  ·  ")}</Text>
        ) : null}
        {visibleSections(style).map((id) => sections[id])}
      </Page>
    </Document>
  );
}
