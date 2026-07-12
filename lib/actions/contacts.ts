"use server";

import { revalidatePath } from "next/cache";
import { api, cleanDoc, convex } from "@/lib/convex/server";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import { enrichPerson } from "@/lib/integrations/apollo/enrich";
import {
  searchPeople,
  searchPeopleFlexible,
  type ApolloPerson,
} from "@/lib/integrations/apollo/search";

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
  companyId: string,
  titles: string[],
  page = 1,
): Promise<ApolloSearchResult> {
  if (!hasApolloKey()) return { ok: false, error: NO_KEY };
  const company = await convex().query(api.companies.getById, { id: companyId as never });
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
      ids.length ? await convex().query(api.contacts.byApolloIds, { apolloIds: ids }) : [],
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

// ── Find NEW people (cold, not yet in your network) ──────────────────────────
// Parse a plain-English query → Apollo people search across the whole database
// (no company/domain needed). Results are shown before anything is saved; email
// reveal stays the separate, credit-gated enrich step.
export type FindPeopleResult =
  | {
      ok: true;
      people: (ApolloPerson & { saved: boolean })[];
      interpretation: string;
      totalEntries: number;
    }
  | { ok: false; error: string };

export async function findNewPeopleAction(
  query: string,
): Promise<FindPeopleResult> {
  const q = query.trim();
  if (!q) return { ok: false, error: "Type who you're looking for first." };
  if (!hasApolloKey()) return { ok: false, error: NO_KEY };

  const { hasApiKey } = await import("@/lib/claude/client");
  if (!hasApiKey()) {
    return {
      ok: false,
      error:
        "Parsing your search into a people query needs ANTHROPIC_API_KEY in .env.local (see Settings).",
    };
  }

  const { queryToApolloParams } = await import("@/lib/claude/apollo-query");
  let params;
  try {
    params = await queryToApolloParams(q);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't read that query." };
  }

  if (
    params.person_titles.length === 0 &&
    params.person_locations.length === 0 &&
    !params.keywords
  ) {
    return {
      ok: false,
      error:
        "Couldn't turn that into a people search — name a role or place, e.g. “recruiters in Philadelphia hiring fullstack devs”.",
    };
  }

  try {
    const res = await searchPeopleFlexible({
      titles: params.person_titles,
      locations: params.person_locations,
      keywords: params.keywords,
      seniorities: params.seniorities,
    });
    const ids = res.people.map((p) => p.apolloId);
    const saved = new Set(
      ids.length ? await convex().query(api.contacts.byApolloIds, { apolloIds: ids }) : [],
    );
    return {
      ok: true,
      people: res.people.map((p) => ({ ...p, saved: saved.has(p.apolloId) })),
      interpretation: params.interpretation,
      totalEntries: res.totalEntries,
    };
  } catch (err) {
    return { ok: false, error: apolloError(err, "People search failed") };
  }
}

// Save a discovered cold contact. No company is required — if the person's
// company matches one you already track, we attach it; otherwise company +
// location are kept in notes so the context isn't lost.
export async function saveColdContactAction(
  person: ApolloPerson,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!person.apolloId || !person.name) {
    return { ok: false, error: "Invalid contact data" };
  }
  const match = person.company
    ? await convex().query(api.companies.getByName, { name: person.company })
    : null;
  const companyId = match?._id ?? null;
  const notes =
    [person.company, person.location].filter(Boolean).join(" · ") || null;

  await convex().mutation(api.contacts.save, {
    doc: cleanDoc({
      companyId,
      name: person.name,
      title: person.title,
      linkedin: person.linkedinUrl,
      photoUrl: person.photoUrl,
      source: "apollo",
      apolloId: person.apolloId,
      emailStatus: person.emailStatus,
      notes,
      outreachStatus: "none",
      createdAt: new Date().toISOString(),
    }),
  });
  revalidatePath("/network");
  return { ok: true };
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
  companyId: string,
  person: ApolloPerson,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!person.apolloId || !person.name) {
    return { ok: false, error: "Invalid contact data" };
  }
  await convex().mutation(api.contacts.save, {
    doc: cleanDoc({
      companyId,
      name: person.name,
      title: person.title,
      linkedin: person.linkedinUrl,
      photoUrl: person.photoUrl,
      source: "apollo",
      apolloId: person.apolloId,
      emailStatus: person.emailStatus,
      outreachStatus: "none",
      createdAt: new Date().toISOString(),
    }),
  });
  revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}

export async function enrichContactAction(
  contactId: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (!hasApolloKey()) return { ok: false, error: NO_KEY };
  const contact = await convex().query(api.contacts.getById, { id: contactId as never });
  if (!contact) return { ok: false, error: "Contact not found" };
  if (contact.email) return { ok: true, email: contact.email };
  if (!contact.apolloId) {
    return { ok: false, error: "Manual contact — add the email by hand." };
  }
  try {
    const res = await enrichPerson({ apolloId: contact.apolloId });
    if (!res.email) {
      // Record the status so the button doesn't invite retry-burning credits.
      await convex().mutation(api.contacts.patch, {
        id: contactId as never,
        patch: { emailStatus: res.emailStatus ?? "unavailable" },
      });
      revalidatePath("/", "layout");
      return { ok: false, error: "Apollo has no work email for this person." };
    }
    await convex().mutation(api.contacts.patch, {
      id: contactId as never,
      patch: cleanDoc({ email: res.email, emailStatus: res.emailStatus }),
    });
    revalidatePath("/", "layout");
    return { ok: true, email: res.email };
  } catch (err) {
    return { ok: false, error: apolloError(err, "Enrichment failed") };
  }
}

// Free local search over saved/imported contacts (no Happenstance credits).
export async function searchLocalContactsAction(query: string) {
  const { searchContacts, listContacts } = await import("@/lib/contacts/query");
  const q = query.trim();
  return q ? searchContacts(q, 60) : listContacts({ limit: 60 });
}

// Paginated browse over all saved/imported contacts (no query, most-recent
// first). Powers the page controls on the Warm Network list.
export async function browseContactsPageAction(
  page = 1,
  pageSize?: number,
) {
  const { listContacts } = await import("@/lib/contacts/query");
  const { normalizeContactsPageSize } = await import("@/lib/contacts/constants");
  const size = normalizeContactsPageSize(pageSize ?? 0);
  const p = Math.max(1, Math.floor(page));
  return {
    rows: await listContacts({
      limit: size,
      offset: (p - 1) * size,
    }),
    page: p,
    pageSize: size,
  };
}

// Semantic "ask" search over ALL contacts via Claude (name/title/company).
export type AskContactsResult =
  | {
      ok: true;
      rows: (import("@/lib/contacts/query").ContactRow & { reason: string })[];
      caveat: string | null;
    }
  | { ok: false; error: string };

export async function askContactsAction(
  query: string,
): Promise<AskContactsResult> {
  const q = query.trim();
  if (!q) return { ok: false, error: "Type a question first." };
  const { hasApiKey } = await import("@/lib/claude/client");
  if (!hasApiKey()) {
    return { ok: false, error: "AI search needs ANTHROPIC_API_KEY in .env.local (see Settings)." };
  }
  const { listContacts } = await import("@/lib/contacts/query");
  // Full set for the model (capped inside askContacts).
  const all = await listContacts({ limit: 5000 });
  if (all.length === 0) return { ok: false, error: "No contacts to search yet." };

  const { askContacts } = await import("@/lib/claude/contact-search");
  try {
    const res = await askContacts(
      q,
      all.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        detail: c.notes ?? c.companyName ?? c.summary,
      })),
    );
    const byId = new Map(all.map((c) => [c.id, c]));
    const rows = res.matches
      .map((m) => {
        const row = byId.get(m.id);
        return row ? { ...row, reason: m.reason } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return { ok: true, rows, caveat: res.caveat };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI search failed" };
  }
}

export async function deleteContactAction(
  contactId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const outreachCount = await convex().query(api.outreach.countForContact, {
    contactId: contactId as never,
  });
  if (outreachCount > 0) {
    return {
      ok: false,
      error: `Blocked: ${outreachCount} outreach record(s) reference this contact.`,
    };
  }
  await convex().mutation(api.contacts.remove, { id: contactId as never });
  revalidatePath("/", "layout");
  return { ok: true };
}
