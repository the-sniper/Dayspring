// Local contact queries — the free, instant "who do I know" over your saved +
// imported contacts (LinkedIn CSV, Apollo, Happenstance saves, manual).
import { desc, eq, or, sql } from "drizzle-orm";
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

// Substring match across name / title / company / notes / summary. Free.
export function searchContacts(query: string, limit = 50): ContactRow[] {
  const q = `%${query.trim().toLowerCase()}%`;
  return db
    .select(SELECT)
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(
      or(
        sql`lower(${contacts.name}) like ${q}`,
        sql`lower(coalesce(${contacts.title}, '')) like ${q}`,
        sql`lower(coalesce(${companies.name}, '')) like ${q}`,
        sql`lower(coalesce(${contacts.notes}, '')) like ${q}`,
        sql`lower(coalesce(${contacts.summary}, '')) like ${q}`,
      ),
    )
    .orderBy(desc(contacts.createdAt))
    .limit(limit)
    .all();
}
