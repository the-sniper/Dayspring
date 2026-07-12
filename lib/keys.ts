// Unified API-key access — the no-terminal path. Every integration reads its
// key through getKey(): environment first (power users, scripts), then the
// encrypted settings row saved from Settings → API Keys. Values at rest are
// AES-256-GCM sealed with the vault key (the launcher generates one on first
// run), never plaintext — Convex only ever sees ciphertext.
import { deleteSetting, getSetting, setSetting } from "@/lib/settings/store";
import { decrypt, encrypt, hasVaultKey, type Sealed } from "@/lib/vault/crypto";

export const SERVICE_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "APOLLO_API_KEY",
  "HAPPENSTANCE_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

const ROW_PREFIX = "apikey:";

// Decrypted-value cache (globalThis: survives dev HMR, invalidated on write).
const g = globalThis as typeof globalThis & {
  __dsKeyCache?: Map<string, string | null>;
};
function cache(): Map<string, string | null> {
  return (g.__dsKeyCache ??= new Map());
}

async function savedKey(name: ServiceKey): Promise<string | null> {
  if (cache().has(name)) return cache().get(name)!;
  let value: string | null = null;
  const raw = await getSetting(`${ROW_PREFIX}${name}`);
  if (raw && hasVaultKey()) {
    try {
      value = decrypt(JSON.parse(raw) as Sealed);
    } catch {
      value = null; // vault key changed → sealed value unreadable; treat as unset
    }
  }
  cache().set(name, value);
  return value;
}

// Env wins (explicit beats stored); otherwise the saved, encrypted value.
export async function getKey(name: ServiceKey): Promise<string | null> {
  return process.env[name] || (await savedKey(name));
}

export async function keySource(name: ServiceKey): Promise<"env" | "saved" | null> {
  if (process.env[name]) return "env";
  return (await savedKey(name)) ? "saved" : null;
}

// Is there a stored (Settings-saved) value, regardless of env override?
// The UI needs this so a saved-but-masked key can still be cleared.
export async function hasSavedKey(name: ServiceKey): Promise<boolean> {
  return (await savedKey(name)) !== null;
}

export async function setKey(name: ServiceKey, value: string): Promise<void> {
  if (!value.trim()) throw new Error("Key is empty.");
  if (!hasVaultKey()) {
    throw new Error(
      "No vault key configured — set DAYSPRING_VAULT_KEY in the environment (it encrypts saved keys at rest).",
    );
  }
  const sealed = encrypt(value.trim());
  await setSetting(`${ROW_PREFIX}${name}`, JSON.stringify(sealed));
  cache().set(name, value.trim());
}

export async function clearKey(name: ServiceKey): Promise<void> {
  await deleteSetting(`${ROW_PREFIX}${name}`);
  cache().set(name, null);
}
