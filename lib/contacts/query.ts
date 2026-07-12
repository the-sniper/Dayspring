// Local contact queries — the free, instant "who do I know" over your saved +
// imported contacts (LinkedIn CSV, Apollo, Happenstance saves, manual).
import { api, convex } from "@/lib/convex/server";

export type ContactRow = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  linkedin: string | null;
  twitter: string | null;
  photoUrl: string | null;
  source: string | null;
  summary: string | null;
  notes: string | null;
  companyId: string | null;
  companyName: string | null;
};

function toRow(c: Record<string, unknown> & { id: string; companyName: string | null }): ContactRow {
  return {
    id: c.id,
    name: c.name as string,
    title: (c.title as string) ?? null,
    email: (c.email as string) ?? null,
    linkedin: (c.linkedin as string) ?? null,
    twitter: (c.twitter as string) ?? null,
    photoUrl: (c.photoUrl as string) ?? null,
    source: (c.source as string) ?? null,
    summary: (c.summary as string) ?? null,
    notes: (c.notes as string) ?? null,
    companyId: (c.companyId as string) ?? null,
    companyName: c.companyName ?? null,
  };
}

// All contacts, newest first (the Convex query returns them unordered).
async function allByRecency(): Promise<ContactRow[]> {
  const rows = await convex().query(api.contacts.allEnriched, {});
  return [...rows]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((c) => toRow(c));
}

export async function contactsCount(): Promise<number> {
  return await convex().query(api.contacts.count, {});
}

export async function listContacts({
  limit = 50,
  offset = 0,
}: { limit?: number; offset?: number } = {}): Promise<ContactRow[]> {
  const all = await allByRecency();
  return all.slice(offset, offset + limit);
}

// Filler words that shouldn't constrain a filter (so "recruiter in philly"
// still surfaces recruiters, and only "recruiter"/"philly" are matched).
const STOPWORDS = new Set([
  "in", "at", "the", "a", "an", "for", "of", "with", "and", "or", "to", "on",
  "who", "that", "works", "work", "working", "hiring", "hire", "hires", "me",
  "i", "know", "people", "person", "someone", "anyone", "looking", "is", "are",
  "my", "any",
]);

// Crude singularizer so "recruiters" matches "recruiter", "developers" →
// "developer". Only strips a trailing 's' on words long enough to be safe.
function normalizeToken(t: string): string {
  const w = t.replace(/[^a-z0-9]/g, "");
  return w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
}

// Word-aware filter: split the query into meaningful tokens and require EACH to
// appear somewhere in name / title / company / notes / summary (AND across
// tokens, OR across fields). Plural/filler-tolerant. Free + instant.
export async function searchContacts(query: string, limit = 60): Promise<ContactRow[]> {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t.replace(/[^a-z0-9]/g, "")))
    .map(normalizeToken)
    .filter((t) => t.length > 1);

  const all = await allByRecency();
  if (tokens.length === 0) return all.slice(0, limit);

  // Each token must appear somewhere in name/title/company/notes/summary.
  return all
    .filter((c) => {
      const hay = [c.name, c.title, c.companyName, c.notes, c.summary]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    })
    .slice(0, limit);
}
