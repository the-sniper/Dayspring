// Local key-value settings store (replaces the old SQLite `settings` table).
// Kept OFF Convex on purpose: it holds machine-local secrets — encrypted API
// keys (apikey:*), the sealed vault master password, and Gmail OAuth tokens —
// which should never leave the machine for Convex Cloud. Values that are
// sensitive are already sealed (AES-256-GCM) by their callers before landing
// here, so the file itself stores opaque strings, exactly as the DB row did.
//
// Synchronous by design so lib/keys.ts, the vault, and the Gmail client keep
// their sync signatures (no async ripple into lib/claude / lib/ai).
import fs from "node:fs";
import path from "node:path";

type Store = Record<string, { value: string; updatedAt: string }>;

function filePath(): string {
  return (
    process.env.DAYSPRING_SETTINGS_PATH ??
    path.join(process.cwd(), "data", "settings.json")
  );
}

const g = globalThis as typeof globalThis & { __dsSettings?: Store };

function load(): Store {
  if (g.__dsSettings) return g.__dsSettings;
  let store: Store = {};
  try {
    const raw = fs.readFileSync(filePath(), "utf-8");
    store = JSON.parse(raw) as Store;
  } catch {
    store = {};
  }
  g.__dsSettings = store;
  return store;
}

function persist(store: Store): void {
  const p = filePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2));
}

export function getSetting(key: string): string | null {
  const row = load()[key];
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  const store = load();
  store[key] = { value, updatedAt: new Date().toISOString() };
  persist(store);
}

export function deleteSetting(key: string): void {
  const store = load();
  if (key in store) {
    delete store[key];
    persist(store);
  }
}

export function hasSetting(key: string): boolean {
  return getSetting(key) !== null;
}
