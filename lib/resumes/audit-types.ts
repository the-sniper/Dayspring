// Fabrication-audit types, shared by the Claude auditor (server), the react-pdf
// template (highlight rendering), and the studio UI. Client-safe — no deps.

export type AuditStatus = "supported" | "adjusted" | "unsupported";

export type AuditFinding = {
  // Where the item lives in the ResumeDoc, dot-separated:
  // "headline" | "summary" | "experience.0.bullets.2" | "experience.0.dates"
  // | "projects.1.bullets.0" | "skills.0.items.3" | "education.0.detail"
  path: string;
  text: string; // the generated text, verbatim as it appears in the doc
  status: AuditStatus;
  sourceQuote: string | null; // supporting quote from the source resume
  note: string | null; // one-line explanation (esp. why something is unsupported)
};

export type ResumeAudit = {
  findings: AuditFinding[];
  summary: string; // one-paragraph "what changed" overview for the studio
};

// text → status lookup for highlight rendering. Keyed on trimmed text so a
// user edit naturally clears the highlight for that run.
export type AuditHighlights = Record<string, AuditStatus>;

export function buildHighlights(audit: ResumeAudit | null): AuditHighlights {
  const map: AuditHighlights = {};
  if (!audit) return map;
  for (const f of audit.findings) {
    if (f.status === "adjusted" || f.status === "unsupported") {
      map[f.text.trim()] = f.status;
    }
  }
  return map;
}
