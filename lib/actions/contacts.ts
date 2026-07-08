"use server";

import { count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { companies, contacts, outreach } from "@/lib/db/schema";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import { enrichPerson } from "@/lib/integrations/apollo/enrich";
import { searchPeople, type ApolloPerson } from "@/lib/integrations/apollo/search";

const NO_KEY = "Contact search needs APOLLO_API_KEY in .env.local (see Settings).";

export type ApolloSearchResult =
  | {
      ok: true;
      people: (ApolloPerson & { saved: boolean })[];
      totalEntries: number;
      page: number;
      totalPages: number;
    }
  | { ok: false; error: string };

export async function searchApolloAction(
  companyId: number,
  titles: string[],
  page = 1,
): Promise<ApolloSearchResult> {
  if (!hasApolloKey()) return { ok: false, error: NO_KEY };
  const company = db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();
  if (!company) return { ok: false, error: "Company not found" };
  if (!company.domain) {
    return {
      ok: false,
      error: "Set this company's domain first — Apollo searches by domain.",
    };
  }
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return { ok: false, error: "Add at least one title." };

  try {
    const res = await searchPeople({ domain: company.domain, titles: clean, page });
    const ids = res.people.map((p) => p.apolloId);
    const saved = new Set(
      ids.length
        ? db
            .select({ apolloId: contacts.apolloId })
            .from(contacts)
            .where(inArray(contacts.apolloId, ids))
            .all()
            .map((c) => c.apolloId)
        : [],
    );
    return {
      ok: true,
      people: res.people.map((p) => ({ ...p, saved: saved.has(p.apolloId) })),
      totalEntries: res.totalEntries,
      page: res.page,
      totalPages: res.totalPages,
    };
  } catch (err) {
    return { ok: false, error: apolloError(err, "Search failed") };
  }
}

// Apollo gates People Search + enrichment behind paid plans and returns a
// verbose JSON blob on 403. Surface something a human can act on.
function apolloError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw.includes("API_INACCESSIBLE") || raw.includes("not accessible")) {
    return "Apollo's contact search requires a paid plan — your current API key is on the free tier, which no longer allows this endpoint. Upgrade at app.apollo.io or add contacts manually.";
  }
  if (raw.includes("HTTP 401")) {
    return "Apollo rejected the API key. Double-check APOLLO_API_KEY in .env.local.";
  }
  if (raw.includes("HTTP 429")) {
    return "Apollo rate limit hit. Wait a moment and try again.";
  }
  return raw || fallback;
}

export async function saveContactAction(
  companyId: number,
  person: ApolloPerson,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!person.apolloId || !person.name) {
    return { ok: false, error: "Invalid contact data" };
  }
  db.insert(contacts)
    .values({
      companyId,
      name: person.name,
      title: person.title,
      linkedin: person.linkedinUrl,
      source: "apollo",
      apolloId: person.apolloId,
      emailStatus: person.emailStatus,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();
  revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}

export async function enrichContactAction(
  contactId: number,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (!hasApolloKey()) return { ok: false, error: NO_KEY };
  const contact = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .get();
  if (!contact) return { ok: false, error: "Contact not found" };
  if (contact.email) return { ok: true, email: contact.email };
  if (!contact.apolloId) {
    return { ok: false, error: "Manual contact — add the email by hand." };
  }
  try {
    const res = await enrichPerson({ apolloId: contact.apolloId });
    if (!res.email) {
      // Record the status so the button doesn't invite retry-burning credits.
      db.update(contacts)
        .set({ emailStatus: res.emailStatus ?? "unavailable" })
        .where(eq(contacts.id, contactId))
        .run();
      revalidatePath("/", "layout");
      return { ok: false, error: "Apollo has no work email for this person." };
    }
    db.update(contacts)
      .set({ email: res.email, emailStatus: res.emailStatus })
      .where(eq(contacts.id, contactId))
      .run();
    revalidatePath("/", "layout");
    return { ok: true, email: res.email };
  } catch (err) {
    return { ok: false, error: apolloError(err, "Enrichment failed") };
  }
}

export async function deleteContactAction(
  contactId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const outreachCount =
    db
      .select({ n: count() })
      .from(outreach)
      .where(eq(outreach.contactId, contactId))
      .get()?.n ?? 0;
  if (outreachCount > 0) {
    return {
      ok: false,
      error: `Blocked: ${outreachCount} outreach record(s) reference this contact.`,
    };
  }
  db.delete(contacts).where(eq(contacts.id, contactId)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}
