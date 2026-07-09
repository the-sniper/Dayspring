// Render a structured ResumeDoc to an ATS-safe PDF via headless Chromium
// (playwright is already a dependency for apply-assist; page.pdf() means zero
// new deps). ATS-safe = single column, real text, standard headings, no
// tables/graphics/photos — parses cleanly AND reads well to a human.
import fs from "node:fs";
import path from "node:path";
import type { ResumeDocType } from "@/lib/claude/resume";

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function contactLine(c: ResumeDocType["contact"]): string {
  return [c.email, c.phone, c.location, c.linkedin, c.website]
    .filter((x): x is string => !!x)
    .map(esc)
    .join('<span class="sep"> · </span>');
}

export function renderResumeHtml(doc: ResumeDocType): string {
  const sections: string[] = [];

  if (doc.summary) {
    sections.push(`<h2>Summary</h2><p class="summary">${esc(doc.summary)}</p>`);
  }

  if (doc.skills.length) {
    sections.push(
      `<h2>Skills</h2><div class="skills">${doc.skills
        .map(
          (g) =>
            `<p><strong>${esc(g.group)}:</strong> ${g.items.map(esc).join(", ")}</p>`,
        )
        .join("")}</div>`,
    );
  }

  if (doc.experience.length) {
    sections.push(
      `<h2>Experience</h2>${doc.experience
        .map(
          (e) => `<div class="entry">
  <div class="entry-head">
    <span class="entry-title">${esc(e.title)}</span><span class="entry-co">&nbsp;— ${esc(e.company)}${e.location ? `, ${esc(e.location)}` : ""}</span>
    <span class="entry-dates">${esc(e.dates)}</span>
  </div>
  <ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
</div>`,
        )
        .join("")}`,
    );
  }

  if (doc.projects.length) {
    sections.push(
      `<h2>Projects</h2>${doc.projects
        .map(
          (p) => `<div class="entry">
  <div class="entry-head"><span class="entry-title">${esc(p.name)}</span>${p.blurb ? `<span class="entry-co">&nbsp;— ${esc(p.blurb)}</span>` : ""}</div>
  ${p.bullets.length ? `<ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
</div>`,
        )
        .join("")}`,
    );
  }

  if (doc.education.length) {
    sections.push(
      `<h2>Education</h2>${doc.education
        .map(
          (e) => `<div class="entry">
  <div class="entry-head">
    <span class="entry-title">${esc(e.school)}</span>${e.degree ? `<span class="entry-co">&nbsp;— ${esc(e.degree)}</span>` : ""}
    ${e.dates ? `<span class="entry-dates">${esc(e.dates)}</span>` : ""}
  </div>
  ${e.detail ? `<p class="edu-detail">${esc(e.detail)}</p>` : ""}
</div>`,
        )
        .join("")}`,
    );
  }

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 9.8pt; line-height: 1.38; color: #1a1a1a;
  }
  .name { font-size: 19pt; font-weight: 700; letter-spacing: -0.02em; }
  .headline { font-size: 10.5pt; color: #444; margin-top: 1pt; }
  .contact { font-size: 8.8pt; color: #333; margin-top: 3pt; }
  .sep { color: #999; }
  h2 {
    font-size: 9pt; text-transform: uppercase; letter-spacing: 0.12em;
    border-bottom: 1px solid #999; padding-bottom: 2pt;
    margin: 10pt 0 5pt;
  }
  .summary { }
  .skills p { margin: 1pt 0; }
  .entry { margin-bottom: 6pt; }
  .entry-head { display: flex; flex-wrap: wrap; align-items: baseline; }
  .entry-title { font-weight: 700; }
  .entry-co { color: #333; }
  .entry-dates { margin-left: auto; color: #555; font-size: 8.8pt; white-space: nowrap; }
  ul { margin: 2pt 0 0 12pt; }
  li { margin-bottom: 1.5pt; }
  .edu-detail { color: #333; margin-top: 1pt; }
</style></head>
<body>
  <div class="name">${esc(doc.name)}</div>
  ${doc.headline ? `<div class="headline">${esc(doc.headline)}</div>` : ""}
  <div class="contact">${contactLine(doc.contact)}</div>
  ${sections.join("\n")}
</body></html>`;
}

export const RESUMES_DIR = path.join(process.cwd(), "data", "resumes");

// Render to PDF at outPath (Letter, standard margins). Launches its own
// headless chromium — ~1s locally, fine for a user-triggered action.
export async function renderResumePdf(
  doc: ResumeDocType,
  outPath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(renderResumeHtml(doc), { waitUntil: "load" });
    await page.pdf({
      path: outPath,
      format: "Letter",
      margin: { top: "0.55in", bottom: "0.55in", left: "0.6in", right: "0.6in" },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}
