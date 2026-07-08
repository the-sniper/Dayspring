"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export type SaveProfileState = { savedAt: string | null };

export async function saveProfileAction(
  _prev: SaveProfileState,
  formData: FormData,
): Promise<SaveProfileState> {
  const value = String(formData.get("profile") ?? "");
  const now = new Date().toISOString();
  db.insert(settings)
    .values({ key: "profile", value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    })
    .run();
  revalidatePath("/settings");
  return { savedAt: now };
}

// Absolute path to the resume PDF on disk — apply-assist uploads it.
export async function saveResumePathAction(
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value = path.trim();
  const now = new Date().toISOString();
  db.insert(settings)
    .values({ key: "resumePath", value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
    .run();
  revalidatePath("/settings");
  return { ok: true };
}
