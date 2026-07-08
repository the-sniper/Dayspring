"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import {
  getUsage,
  hasHappenstanceKey,
} from "@/lib/integrations/happenstance/client";
import {
  researchPerson,
} from "@/lib/integrations/happenstance/research";
import {
  searchNetwork,
  type HappenstancePerson,
} from "@/lib/integrations/happenstance/search";

const NO_KEY =
  "Warm-network search needs HAPPENSTANCE_API_KEY in .env.local (see Settings).";

export type NetworkSearchResult =
  | {
      ok: true;
      people: (HappenstancePerson & { saved: boolean })[];
      hasMore: boolean;
      balance: number | null;
    }
  | { ok: false; error: string };

export async function searchNetworkAction(
  text: string,
): Promise<NetworkSearchResult> {
  if (!hasHappenstanceKey()) return { ok: false, error: NO_KEY };
  const query = text.trim();
  if (!query) return { ok: false, error: "Type who you're looking for." };

  try {
    const [{ people, hasMore }, usage] = await Promise.all([
      searchNetwork({ text: query }),
      getUsage(),
    ]);
    const ids = people.map((p) => p.happenstanceId);
    const saved = new Set(
      ids.length
        ? db
            .select({ id: contacts.happenstanceId })
            .from(contacts)
            .where(inArray(contacts.happenstanceId, ids))
            .all()
            .map((c) => c.id)
        : [],
    );
    return {
      ok: true,
      people: people.map((p) => ({ ...p, saved: saved.has(p.happenstanceId) })),
      hasMore,
      balance: usage.balance,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Search failed" };
  }
}

export async function saveNetworkContactAction(
  companyId: number | null,
  person: HappenstancePerson,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!person.happenstanceId || !person.name) {
    return { ok: false, error: "Invalid contact data" };
  }
  db.insert(contacts)
    .values({
      companyId: companyId ?? null,
      name: person.name,
      title: person.title,
      linkedin: person.linkedin,
      twitter: person.twitter,
      source: "happenstance",
      happenstanceId: person.happenstanceId,
      summary: person.summary,
      mutuals: person.mutuals.length ? person.mutuals : null,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();
  revalidatePath("/", "layout");
  return { ok: true };
}

export type ResearchContactResult =
  | { ok: true; summary: string | null; url: string | null }
  | { ok: false; error: string };

export async function researchNetworkContactAction(
  contactId: number,
): Promise<ResearchContactResult> {
  if (!hasHappenstanceKey()) return { ok: false, error: NO_KEY };
  const contact = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .get();
  if (!contact) return { ok: false, error: "Contact not found" };

  const description = [
    contact.name,
    contact.title,
    contact.linkedin ? `LinkedIn: ${contact.linkedin}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  try {
    const profile = await researchPerson({ description });
    if (profile.summary) {
      db.update(contacts)
        .set({ summary: profile.summary })
        .where(eq(contacts.id, contactId))
        .run();
      revalidatePath("/", "layout");
    }
    return { ok: true, summary: profile.summary, url: profile.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Research failed" };
  }
}

export async function networkBalanceAction(): Promise<number | null> {
  if (!hasHappenstanceKey()) return null;
  return (await getUsage()).balance;
}
