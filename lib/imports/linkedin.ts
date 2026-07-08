import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, contacts } from "@/lib/db/schema";
import { parseCsv } from "@/lib/imports/csv";

// One row of LinkedIn's Connections.csv, mapped to a contact.
export type LinkedinCandidate = {
  name: string;
  linkedin: string | null;
  email: string | null;
  companyName: string | null;
  title: string | null;
  connectedOn: string | null;
};

export type PreparedLinkedin = LinkedinCandidate & { duplicate: boolean };

export type LinkedinParseResult = {
  candidates: PreparedLinkedin[];
  warnings: string[];
};

// LinkedIn exports "Connections.csv" with a 2–3 line "Notes:" preamble before
// the real header row. Find the header, then map by column name (order varies
// across exports). Columns: First Name, Last Name, URL, Email Address,
// Company, Position, Connected On.
export function linkedinCsvToCandidates(text: string): LinkedinParseResult {
  const rows = parseCsv(text);
  const warnings: string[] = [];

  const headerIdx = rows.findIndex(
    (r) =>
      r.some((c) => /first name/i.test(c)) &&
      r.some((c) => /last name/i.test(c)),
  );
  if (headerIdx === -1) {
    return {
      candidates: [],
      warnings: [
        "Couldn't find the LinkedIn header row (First Name / Last Name / URL). Is this a Connections.csv export?",
      ],
    };
  }

  const header = rows[headerIdx].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name);
  const iFirst = col("first name");
  const iLast = col("last name");
  const iUrl = col("url");
  const iEmail = col("email address");
  const iCompany = col("company");
  const iPosition = col("position");
  const iConnected = col("connected on");

  const at = (r: string[], i: number) => (i >= 0 ? (r[i]?.trim() ?? "") : "");

  const candidates: LinkedinCandidate[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const name = [at(row, iFirst), at(row, iLast)].filter(Boolean).join(" ").trim();
    if (!name) continue; // LinkedIn leaves nameless rows for un-shared connections
    candidates.push({
      name,
      linkedin: normalizeLinkedin(at(row, iUrl)) || null,
      email: at(row, iEmail) || null,
      companyName: at(row, iCompany) || null,
      title: at(row, iPosition) || null,
      connectedOn: at(row, iConnected) || null,
    });
  }

  if (candidates.length === 0) {
    warnings.push("No connections with names found in the file.");
  }

  // Dedupe within the file (by normalized URL, else name+company).
  const seen = new Set<string>();
  const deduped: LinkedinCandidate[] = [];
  for (const c of candidates) {
    const key = c.linkedin ?? `${c.name.toLowerCase()}|${(c.companyName ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  const inFileDupes = candidates.length - deduped.length;
  if (inFileDupes > 0) {
    warnings.push(`${inFileDupes} duplicate row(s) within the file were merged.`);
  }

  return { candidates: flagExisting(deduped), warnings };
}

// Strip query/hash/trailing slash so the same connection dedupes across exports.
function normalizeLinkedin(url: string): string {
  const u = url.trim();
  if (!u) return "";
  return u.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
}

// Flag candidates already in contacts (by normalized linkedin URL).
function flagExisting(candidates: LinkedinCandidate[]): PreparedLinkedin[] {
  const existing = new Set(
    db
      .select({ linkedin: contacts.linkedin })
      .from(contacts)
      .where(sql`${contacts.linkedin} is not null`)
      .all()
      .map((c) => normalizeLinkedin(c.linkedin ?? "")),
  );
  return candidates.map((c) => ({
    ...c,
    duplicate: !!c.linkedin && existing.has(c.linkedin),
  }));
}

// Insert selected candidates. Attaches companyId ONLY when the company already
// exists (never auto-creates hundreds of companies from a connections dump).
export function confirmLinkedinImport(
  candidates: LinkedinCandidate[],
): { inserted: number; skipped: number } {
  const now = new Date().toISOString();
  // Existing linkedin URLs, to skip cross-batch dupes.
  const existingUrls = new Set(
    db
      .select({ linkedin: contacts.linkedin })
      .from(contacts)
      .where(sql`${contacts.linkedin} is not null`)
      .all()
      .map((c) => normalizeLinkedin(c.linkedin ?? "")),
  );

  let inserted = 0;
  let skipped = 0;
  for (const c of candidates) {
    if (c.linkedin && existingUrls.has(c.linkedin)) {
      skipped++;
      continue;
    }
    const company = c.companyName
      ? db
          .select({ id: companies.id })
          .from(companies)
          .where(sql`lower(${companies.name}) = ${c.companyName.trim().toLowerCase()}`)
          .get()
      : null;
    db.insert(contacts)
      .values({
        companyId: company?.id ?? null,
        name: c.name,
        title: c.title,
        email: c.email,
        linkedin: c.linkedin,
        source: "linkedin",
        notes: [c.title && c.companyName ? `${c.title} @ ${c.companyName}` : c.companyName,
          c.connectedOn ? `Connected ${c.connectedOn}` : null]
          .filter(Boolean)
          .join(" · ") || null,
        createdAt: now,
      })
      .run();
    if (c.linkedin) existingUrls.add(c.linkedin);
    inserted++;
  }
  return { inserted, skipped };
}
