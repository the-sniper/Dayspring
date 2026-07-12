// Key-value settings store, backed by the Convex `settings` table so hosted
// deployments (read-only disk) work. Sensitive values are AES-256-GCM sealed
// by their callers (lib/keys.ts, lib/vault) BEFORE landing here — Convex only
// ever stores opaque ciphertext for those rows; the vault key stays in env.
//
// Reads are cached briefly (per process, on globalThis so dev HMR keeps it) —
// a page render hits getSetting many times and shouldn't pay a Convex
// round-trip for each. Writes update the cache immediately.
//
// MULTI-USER: settings are per user, but this cache is per process — entries
// are namespaced by cacheScope() (the JWT subject) so users sharing a
// serverless instance can never read each other's cached values.
import { api, cacheScope, convex } from "@/lib/convex/server";

type CacheEntry = { value: string | null; at: number };

const TTL_MS = 15_000;

const g = globalThis as typeof globalThis & {
  __dsSettingsCache?: Map<string, CacheEntry>;
};

function cache(): Map<string, CacheEntry> {
  return (g.__dsSettingsCache ??= new Map());
}

export async function getSetting(key: string): Promise<string | null> {
  const scoped = `${await cacheScope()}:${key}`;
  const hit = cache().get(scoped);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await convex().query(api.settings.get, { key });
  cache().set(scoped, { value, at: Date.now() });
  return value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await convex().mutation(api.settings.set, { key, value });
  cache().set(`${await cacheScope()}:${key}`, { value, at: Date.now() });
}

export async function deleteSetting(key: string): Promise<void> {
  await convex().mutation(api.settings.remove, { key });
  cache().set(`${await cacheScope()}:${key}`, { value: null, at: Date.now() });
}

export async function hasSetting(key: string): Promise<boolean> {
  return (await getSetting(key)) !== null;
}
