import { api, cleanDoc, convex } from "@/lib/convex/server";
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
export async function linkedinCsvToCandidates(text: string): Promise<LinkedinParseResult> {
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

  return { candidates: await flagExisting(deduped), warnings };
}

// Strip query/hash/trailing slash so the same connection dedupes across exports.
function normalizeLinkedin(url: string): string {
  const u = url.trim();
  if (!u) return "";
  return u.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
}

// Existing normalized linkedin URLs across all saved contacts.
async function existingLinkedinUrls(): Promise<Set<string>> {
  const all = await convex().query(api.contacts.allEnriched, {});
  return new Set(
    all
      .filter((c) => c.linkedin)
      .map((c) => normalizeLinkedin(c.linkedin ?? "")),
  );
}

// Flag candidates already in contacts (by normalized linkedin URL).
async function flagExisting(candidates: LinkedinCandidate[]): Promise<PreparedLinkedin[]> {
  const existing = await existingLinkedinUrls();
  return candidates.map((c) => ({
    ...c,
    duplicate: !!c.linkedin && existing.has(c.linkedin),
  }));
}

// Insert selected candidates. Attaches companyId ONLY when the company already
// exists (never auto-creates hundreds of companies from a connections dump).
export async function confirmLinkedinImport(
  candidates: LinkedinCandidate[],
): Promise<{ inserted: number; skipped: number }> {
  const now = new Date().toISOString();
  const existingUrls = await existingLinkedinUrls();

  let inserted = 0;
  let skipped = 0;
  for (const c of candidates) {
    if (c.linkedin && existingUrls.has(c.linkedin)) {
      skipped++;
      continue;
    }
    const company = c.companyName
      ? await convex().query(api.companies.getByName, { name: c.companyName })
      : null;
    await convex().mutation(api.contacts.save, {
      doc: cleanDoc({
        companyId: company?._id ?? null,
        name: c.name,
        title: c.title,
        email: c.email,
        linkedin: c.linkedin,
        source: "linkedin",
        outreachStatus: "none",
        notes:
          [
            c.title && c.companyName ? `${c.title} @ ${c.companyName}` : c.companyName,
            c.connectedOn ? `Connected ${c.connectedOn}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        createdAt: now,
      }),
    });
    if (c.linkedin) existingUrls.add(c.linkedin);
    inserted++;
  }
  return { inserted, skipped };
}
