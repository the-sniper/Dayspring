"use server";

import { revalidatePath } from "next/cache";
import {
  addCredential,
  deleteCredential,
  revealCredential,
  setMasterPassword,
} from "@/lib/vault/core";
import { hasVaultKey } from "@/lib/vault/crypto";

const NO_KEY =
  "Set DAYSPRING_VAULT_KEY in .env.local first — it encrypts the vault at rest.";

export async function setMasterPasswordAction(
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasVaultKey()) return { ok: false, error: NO_KEY };
  if (!password || password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  try {
    setMasterPassword(password);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function addCredentialAction(input: {
  site: string;
  host: string;
  username: string;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasVaultKey()) return { ok: false, error: NO_KEY };
  if (!input.site.trim() || !input.host.trim() || !input.username.trim()) {
    return { ok: false, error: "Site, host, and email are required." };
  }
  const res = addCredential({
    site: input.site.trim(),
    host: input.host.trim(),
    username: input.username.trim(),
    notes: input.notes?.trim() || undefined,
  });
  if (res.ok) revalidatePath("/settings");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function revealCredentialAction(
  id: number,
): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  if (!hasVaultKey()) return { ok: false, error: NO_KEY };
  const password = revealCredential(id);
  if (password === null) return { ok: false, error: "Not found" };
  return { ok: true, password };
}

export async function deleteCredentialAction(
  id: number,
): Promise<{ ok: true }> {
  deleteCredential(id);
  revalidatePath("/settings");
  return { ok: true };
}
