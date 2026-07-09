// Local contact queries — the free, instant "who do I know" over your saved +
// imported contacts (LinkedIn CSV, Apollo, Happenstance saves, manual).
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, contacts } from "@/lib/db/schema";

export type ContactRow = {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
  linkedin: string | null;
  twitter: string | null;
  source: string | null;
  summary: string | null;
  notes: string | null;
  companyId: number | null;
  companyName: string | null;
};

const SELECT = {
  id: contacts.id,
  name: contacts.name,
  title: contacts.title,
  email: contacts.email,
  linkedin: contacts.linkedin,
  twitter: contacts.twitter,
  source: contacts.source,
  summary: contacts.summary,
  notes: contacts.notes,
  companyId: contacts.companyId,
  companyName: companies.name,
};

export function contactsCount(): number {
  return db.select({ n: sql<number>`count(*)` }).from(contacts).get()?.n ?? 0;
}

export function listContacts({
  limit = 50,
  offset = 0,
}: { limit?: number; offset?: number } = {}): ContactRow[] {
  return db
    .select(SELECT)
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .orderBy(desc(contacts.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
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
export function searchContacts(query: string, limit = 60): ContactRow[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t.replace(/[^a-z0-9]/g, "")))
    .map(normalizeToken)
    .filter((t) => t.length > 1);

  if (tokens.length === 0) return listContacts({ limit });

  const perToken = tokens.map((tok) => {
    const like = `%${tok}%`;
    return or(
      sql`lower(${contacts.name}) like ${like}`,
      sql`lower(coalesce(${contacts.title}, '')) like ${like}`,
      sql`lower(coalesce(${companies.name}, '')) like ${like}`,
      sql`lower(coalesce(${contacts.notes}, '')) like ${like}`,
      sql`lower(coalesce(${contacts.summary}, '')) like ${like}`,
    );
  });

  return db
    .select(SELECT)
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(...perToken))
    .orderBy(desc(contacts.createdAt))
    .limit(limit)
    .all();
}
