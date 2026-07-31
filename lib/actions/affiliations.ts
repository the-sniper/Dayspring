"use server";

import { revalidatePath } from "next/cache";
import { api, convex } from "@/lib/convex/server";

export type AffiliationInput = {
  contactId: string;
  kind: string;
  detail: string;
  strength: number;
  evidenceUrl?: string;
};

export async function addAffiliationAction(input: AffiliationInput) {
  try {
    await convex().mutation(api.affiliations.insert, {
      contactId: input.contactId as never,
      kind: input.kind,
      detail: input.detail,
      strength: input.strength,
      evidenceUrl: input.evidenceUrl || undefined,
    });
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Failed to save affiliation",
    };
  }
}

export async function removeAffiliationAction(id: string) {
  try {
    await convex().mutation(api.affiliations.remove, { id: id as never });
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Failed to remove affiliation",
    };
  }
}
