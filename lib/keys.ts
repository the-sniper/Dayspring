// Unified API-key access — the no-terminal path. Every integration reads its
// key through getKey(): environment first (power users, scripts), then the
// encrypted settings row saved from Settings → API Keys. Values at rest are
// AES-256-GCM sealed with the vault key (the launcher generates one on first
// run), never plaintext.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { decrypt, encrypt, hasVaultKey, type Sealed } from "@/lib/vault/crypto";

export const SERVICE_KEYS = [
  "ANTHROPIC_API_KEY",
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

function savedKey(name: ServiceKey): string | null {
  if (cache().has(name)) return cache().get(name)!;
  let value: string | null = null;
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, `${ROW_PREFIX}${name}`))
    .get();
  if (row && hasVaultKey()) {
    try {
      value = decrypt(JSON.parse(row.value) as Sealed);
    } catch {
      value = null; // vault key changed → sealed value unreadable; treat as unset
    }
  }
  cache().set(name, value);
  return value;
}

// Env wins (explicit beats stored); otherwise the saved, encrypted value.
export function getKey(name: ServiceKey): string | null {
  return process.env[name] || savedKey(name);
}

export function keySource(name: ServiceKey): "env" | "saved" | null {
  if (process.env[name]) return "env";
  return savedKey(name) ? "saved" : null;
}

// Is there a stored (Settings-saved) value, regardless of env override?
// The UI needs this so a saved-but-masked key can still be cleared.
export function hasSavedKey(name: ServiceKey): boolean {
  return savedKey(name) !== null;
}

export function setKey(name: ServiceKey, value: string): void {
  if (!value.trim()) throw new Error("Key is empty.");
  if (!hasVaultKey()) {
    throw new Error(
      "No vault key on this machine — launch Dayspring via Dayspring.app (it creates one) or add DAYSPRING_VAULT_KEY to .env.local.",
    );
  }
  const sealed = encrypt(value.trim());
  const now = new Date().toISOString();
  db.insert(settings)
    .values({ key: `${ROW_PREFIX}${name}`, value: JSON.stringify(sealed), updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(sealed), updatedAt: now },
    })
    .run();
  cache().set(name, value.trim());
}

export function clearKey(name: ServiceKey): void {
  db.delete(settings).where(eq(settings.key, `${ROW_PREFIX}${name}`)).run();
  cache().set(name, null);
}
