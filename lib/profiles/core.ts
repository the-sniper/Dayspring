// Next-free profile core (M27). One default profile drives scoring, tailoring,
// and apply autofill; several can exist for different tracks ("SWE", "ML").
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, settings, type ApplicationDefaults } from "@/lib/db/schema";
import type { ConsolidatedDoc } from "@/lib/claude/consolidate";

export type ProfileRow = typeof profiles.$inferSelect;

export const EMPTY_DEFAULTS: ApplicationDefaults = {
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
};

export function listProfiles(): ProfileRow[] {
  return db.select().from(profiles).orderBy(desc(profiles.isDefault), profiles.name).all();
}

// The default profile — seeded from the legacy settings.profile blob the
// first time anything asks for it (so existing installs migrate themselves).
export function getDefaultProfile(): ProfileRow | null {
  const row = db.select().from(profiles).where(eq(profiles.isDefault, true)).get();
  if (row) return row;
  const any = db.select().from(profiles).orderBy(profiles.id).get();
  if (any) {
    // Rows exist but none default (shouldn't happen) — repair.
    db.update(profiles).set({ isDefault: true }).where(eq(profiles.id, any.id)).run();
    return { ...any, isDefault: true };
  }
  return seedFromLegacy();
}

function seedFromLegacy(): ProfileRow | null {
  const legacy =
    db.select().from(settings).where(eq(settings.key, "profile")).get()?.value ?? "";
  if (!legacy.trim() || legacy.startsWith("REPLACE ME")) return null;
  const now = new Date().toISOString();
  const res = db
    .insert(profiles)
    .values({
      name: "Default",
      isDefault: true,
      content: legacy,
      defaults: EMPTY_DEFAULTS,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return db.select().from(profiles).where(eq(profiles.id, Number(res.lastInsertRowid))).get() ?? null;
}

// The text the AI pipeline consumes: corpus + an explicit preferences block
// derived from the structured defaults (so scoring finally has real
// visa/location facts instead of a hand-typed scaffold).
export function profileText(p: ProfileRow): string {
  const d = p.defaults;
  const prefLines: string[] = [];
  if (p.location) prefLines.push(`- Based in: ${p.location}`);
  if (d?.visaType) prefLines.push(`- Visa / work authorization: ${d.visaType}`);
  if (d?.authorizedToWork !== null && d?.authorizedToWork !== undefined)
    prefLines.push(`- Authorized to work in the US: ${d.authorizedToWork ? "yes" : "no"}`);
  if (d?.needsSponsorship !== null && d?.needsSponsorship !== undefined)
    prefLines.push(`- Needs sponsorship: ${d.needsSponsorship ? "yes" : "no"}`);
  if (d?.canRelocate !== null && d?.canRelocate !== undefined)
    prefLines.push(`- Open to relocation: ${d.canRelocate ? "yes" : "no"}`);
  if (d?.inPersonOk !== null && d?.inPersonOk !== undefined)
    prefLines.push(`- In-person / hybrid OK: ${d.inPersonOk ? "yes" : "no"}`);
  const prefs = prefLines.length
    ? `\n\n---\nCANDIDATE PREFERENCES (user-set):\n${prefLines.join("\n")}`
    : "";
  return `${p.content.trim()}${prefs}`;
}

export function setDefaultProfile(id: number): void {
  db.update(profiles).set({ isDefault: false }).run();
  db.update(profiles).set({ isDefault: true }).where(eq(profiles.id, id)).run();
}

// New profiles start as a copy of the current default — tweak from there.
export function createProfile(name: string): number {
  const base = getDefaultProfile();
  const now = new Date().toISOString();
  const res = db
    .insert(profiles)
    .values({
      name: name.trim() || "Untitled",
      isDefault: false,
      fullName: base?.fullName ?? null,
      headline: base?.headline ?? null,
      summary: base?.summary ?? null,
      email: base?.email ?? null,
      phone: base?.phone ?? null,
      location: base?.location ?? null,
      linkedin: base?.linkedin ?? null,
      github: base?.github ?? null,
      website: base?.website ?? null,
      content: base?.content ?? "",
      doc: base?.doc ?? null,
      defaults: base?.defaults ?? EMPTY_DEFAULTS,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return Number(res.lastInsertRowid);
}

export function deleteProfile(id: number): { ok: true } | { ok: false; error: string } {
  const row = db.select().from(profiles).where(eq(profiles.id, id)).get();
  if (!row) return { ok: false, error: "Profile not found." };
  if (row.isDefault) return { ok: false, error: "Make another profile default first." };
  db.delete(profiles).where(eq(profiles.id, id)).run();
  return { ok: true };
}

export function updateProfile(
  id: number,
  patch: Partial<
    Pick<
      ProfileRow,
      | "name"
      | "fullName"
      | "headline"
      | "summary"
      | "email"
      | "phone"
      | "location"
      | "linkedin"
      | "github"
      | "website"
      | "content"
      | "doc"
      | "defaults"
    >
  >,
): void {
  db.update(profiles)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(profiles.id, id))
    .run();
}

// ── Legacy-doc migration (M29) ───────────────────────────────────────────────
// M27 docs stored education as {school, degree, dates, detail} strings and
// certifications as plain strings. Normalize on read so older rows render and
// edit in the richer shape; the next save persists the new format.
/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeEducation(e: any): ConsolidatedDoc["education"][number] {
  if ("field" in e || "gpa" in e || "startDate" in e) return e; // already new
  let degree: string | null = e.degree ?? null;
  let field: string | null = null;
  let gpa: string | null = null;
  let startDate: string | null = null;
  let endDate: string | null = null;
  let location: string | null = null;
  const leftovers: string[] = [];

  // "Masters in Computer Science" → degree "Masters", field "Computer Science"
  const degIn = degree?.match(/^(.*?)\s+in\s+(.+)$/i);
  if (degIn) {
    degree = degIn[1].trim();
    field = degIn[2].trim();
  }

  // dates: "Sep 2024 – Mar 2026" or "Expected Graduation: June 2026"
  const dates: string = e.dates ?? "";
  const expected = dates.match(/expected\s+graduation[:\s]*(.+)/i);
  const range = dates.match(/^(.+?)\s*[–—-]\s*(.+)$/);
  if (expected) endDate = `${expected[1].trim()} (expected)`;
  else if (range) {
    startDate = range[1].trim();
    endDate = range[2].trim();
  } else if (dates.trim()) endDate = dates.trim();

  // detail: mine GPA / concentration / location out of the blob
  for (const part of String(e.detail ?? "")
    .split(/[·—]|\s{2,}/)
    .map((s: string) => s.trim())
    .filter(Boolean)) {
    const g = part.match(/gpa[:\s]*([0-4](?:\.\d+)?)/i);
    const conc = part.match(/^concentration[:\s]*(.+)$/i);
    if (g) gpa = g[1];
    else if (conc && !field) field = conc[1].trim();
    else if (/^[A-Z][A-Za-z .]+,\s*[A-Z]{2}$/.test(part)) location = part;
    else leftovers.push(part);
  }

  return {
    school: e.school ?? "",
    degree,
    field,
    minor: null,
    gpa,
    startDate,
    endDate,
    location,
    detail: leftovers.length ? leftovers.join(" · ") : null,
  };
}

export function normalizeDoc(raw: unknown): ConsolidatedDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as any;
  return {
    ...d,
    education: (d.education ?? []).map(normalizeEducation),
    certifications: (d.certifications ?? []).map((c: any) =>
      typeof c === "string"
        ? {
            name: c,
            organization: null,
            issueDate: null,
            expirationDate: null,
            credentialId: null,
            credentialUrl: null,
          }
        : c,
    ),
  } as ConsolidatedDoc;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function readProfileDoc(p: ProfileRow): ConsolidatedDoc | null {
  return normalizeDoc(p.doc);
}

// Deterministic doc → markdown (no LLM) — what "Apply to profile" writes.
export function docToMarkdown(doc: ConsolidatedDoc): string {
  const lines: string[] = [`# ${doc.name}`];
  const contact = [doc.contact.email, doc.contact.phone, doc.contact.location, doc.contact.linkedin, doc.contact.github, doc.contact.website]
    .filter(Boolean)
    .join(" · ");
  if (doc.headline) lines.push(`\n${doc.headline}`);
  if (contact) lines.push(`\n${contact}`);
  if (doc.summary) lines.push(`\n## Summary\n\n${doc.summary}`);
  if (doc.skills.length) {
    lines.push(`\n## Skills\n`);
    for (const g of doc.skills) lines.push(`- **${g.group}:** ${g.items.join(", ")}`);
  }
  if (doc.experience.length) {
    lines.push(`\n## Experience\n`);
    for (const e of doc.experience) {
      lines.push(`### ${e.title} — ${e.company}${e.location ? `, ${e.location}` : ""} (${e.dates})`);
      for (const b of e.bullets) lines.push(`- ${b}`);
      lines.push("");
    }
  }
  if (doc.projects.length) {
    lines.push(`\n## Projects\n`);
    for (const p of doc.projects) {
      lines.push(`### ${p.name}${p.blurb ? ` — ${p.blurb}` : ""}`);
      for (const b of p.bullets) lines.push(`- ${b}`);
      lines.push("");
    }
  }
  if (doc.education.length) {
    lines.push(`\n## Education\n`);
    for (const e of doc.education) {
      const degreeLine = [e.degree, e.field && `in ${e.field}`, e.minor && `(minor: ${e.minor})`]
        .filter(Boolean)
        .join(" ");
      const dates = [e.startDate, e.endDate].filter(Boolean).join(" – ");
      const bits = [degreeLine || null, e.gpa ? `GPA ${e.gpa}` : null, dates || null, e.location, e.detail]
        .filter(Boolean)
        .join(" · ");
      lines.push(`- ${e.school}${bits ? ` — ${bits}` : ""}`);
    }
  }
  if (doc.certifications.length) {
    lines.push(`\n## Certifications\n`);
    for (const c of doc.certifications) {
      const bits = [c.organization, [c.issueDate, c.expirationDate].filter(Boolean).join(" – ") || null, c.credentialId && `ID ${c.credentialId}`]
        .filter(Boolean)
        .join(" · ");
      lines.push(`- ${c.name}${bits ? ` — ${bits}` : ""}`);
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Tsenta-style completeness meter — purely informational.
export function completeness(p: ProfileRow): number {
  const doc = p.doc as ConsolidatedDoc | null;
  const checks = [
    !!p.fullName,
    !!p.email,
    !!p.phone,
    !!p.location,
    !!(p.linkedin || p.github || p.website),
    !!p.summary,
    !!doc?.experience?.length,
    !!doc?.education?.length,
    !!doc?.skills?.length,
    !!p.defaults && Object.values(p.defaults).some((v) => v !== null),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
