// Unified API-key access. Signed-in users (web or CLI) only see keys they
// saved in Settings → API Keys — per-user, AES-256-GCM sealed in Convex.
// Env vars are a local-operator fallback only: unauthenticated CLI on a
// non-hosted machine (.env.local). Hosted deployments (Vercel) never read
// shared env keys into user sessions — that would leak the operator's keys
// to every account.
import { cacheScope } from "@/lib/convex/server";
import { isHosted } from "@/lib/hosted";
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
// Keys are per user now — entries are namespaced by cacheScope() so users
// sharing a process never see each other's decrypted keys.
const g = globalThis as typeof globalThis & {
  __dsKeyCache?: Map<string, string | null>;
};
function cache(): Map<string, string | null> {
  return (g.__dsKeyCache ??= new Map());
}

async function savedKey(name: ServiceKey): Promise<string | null> {
  const scoped = `${await cacheScope()}:${name}`;
  if (cache().has(scoped)) return cache().get(scoped)!;
  let value: string | null = null;
  const raw = await getSetting(`${ROW_PREFIX}${name}`);
  if (raw && hasVaultKey()) {
    try {
      value = decrypt(JSON.parse(raw) as Sealed);
    } catch {
      value = null; // vault key changed → sealed value unreadable; treat as unset
    }
  }
  cache().set(scoped, value);
  return value;
}

// Local-operator env fallback — never for signed-in users or hosted deploys.
async function envFallback(name: ServiceKey): Promise<string | null> {
  if (isHosted()) return null;
  if ((await cacheScope()) !== "anon") return null;
  return process.env[name] || null;
}

export async function getKey(name: ServiceKey): Promise<string | null> {
  return (await savedKey(name)) ?? (await envFallback(name));
}

export async function keySource(name: ServiceKey): Promise<"env" | "saved" | null> {
  if (await savedKey(name)) return "saved";
  if (await envFallback(name)) return "env";
  return null;
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
  cache().set(`${await cacheScope()}:${name}`, value.trim());
}

export async function clearKey(name: ServiceKey): Promise<void> {
  await deleteSetting(`${ROW_PREFIX}${name}`);
  cache().set(`${await cacheScope()}:${name}`, null);
}
