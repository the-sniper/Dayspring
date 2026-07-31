"use server";

import { revalidatePath } from "next/cache";
import { api, cleanDoc, convex } from "@/lib/convex/server";
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

import { keyMessages } from "@/lib/keys/messages";

const NO_KEY = keyMessages.happenstance;

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
  if (!await hasHappenstanceKey()) return { ok: false, error: NO_KEY };
  const query = text.trim();
  if (!query) return { ok: false, error: "Type who you're looking for." };

  try {
    const [{ people, hasMore }, usage] = await Promise.all([
      searchNetwork({ text: query }),
      getUsage(),
    ]);
    const ids = people.map((p) => p.happenstanceId);
    const saved = new Set(
      ids.length ? await convex().query(api.contacts.byHappenstanceIds, { ids }) : [],
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
  companyId: string | null,
  person: HappenstancePerson,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!person.happenstanceId || !person.name) {
    return { ok: false, error: "Invalid contact data" };
  }
  await convex().mutation(api.contacts.save, {
    doc: cleanDoc({
      companyId: companyId ?? null,
      name: person.name,
      title: person.title,
      linkedin: person.linkedin,
      twitter: person.twitter,
      source: "happenstance",
      happenstanceId: person.happenstanceId,
      summary: person.summary,
      mutuals: person.mutuals.length ? person.mutuals : null,
      outreachStatus: "none",
      createdAt: new Date().toISOString(),
    }),
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export type ResearchContactResult =
  | { ok: true; summary: string | null; url: string | null }
  | { ok: false; error: string };

export async function researchNetworkContactAction(
  contactId: string,
): Promise<ResearchContactResult> {
  if (!await hasHappenstanceKey()) return { ok: false, error: NO_KEY };
  const contact = await convex().query(api.contacts.getById, { id: contactId as never });
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
      await convex().mutation(api.contacts.patch, {
        id: contactId as never,
        patch: { summary: profile.summary },
      });
      revalidatePath("/", "layout");
    }
    return { ok: true, summary: profile.summary, url: profile.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Research failed" };
  }
}

export async function networkBalanceAction(): Promise<number | null> {
  if (!await hasHappenstanceKey()) return null;
  return (await getUsage()).balance;
}
