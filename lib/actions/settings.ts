"use server";

import { revalidatePath } from "next/cache";
import { setSetting } from "@/lib/settings/store";

export type SaveProfileState = { savedAt: string | null };

export async function saveProfileAction(
  _prev: SaveProfileState,
  formData: FormData,
): Promise<SaveProfileState> {
  const value = String(formData.get("profile") ?? "");
  const now = new Date().toISOString();
  await setSetting("profile", value);
  revalidatePath("/settings");
  return { savedAt: now };
}

// Absolute path to the resume PDF on disk — apply-assist uploads it.
export async function saveResumePathAction(
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await setSetting("resumePath", path.trim());
  revalidatePath("/settings");
  return { ok: true };
}
