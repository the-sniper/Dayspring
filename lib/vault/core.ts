// Next-free vault operations — actions, apply.ts, and workday-signup all use
// this. The ONE master password (Tsenta-style): set once, reused for every
// generated site account.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings, siteCredentials } from "@/lib/db/schema";
import { decrypt, encrypt, hasVaultKey, type Sealed } from "@/lib/vault/crypto";

const MASTER_KEY = "masterPasswordEnc";

export function hasMasterPassword(): boolean {
  return (
    hasVaultKey() &&
    !!db.select().from(settings).where(eq(settings.key, MASTER_KEY)).get()
  );
}

export function setMasterPassword(password: string): void {
  if (!password) throw new Error("Password required");
  const sealed = encrypt(password);
  const now = new Date().toISOString();
  db.insert(settings)
    .values({ key: MASTER_KEY, value: JSON.stringify(sealed), updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(sealed), updatedAt: now },
    })
    .run();
}

export function getMasterPassword(): string | null {
  const row = db.select().from(settings).where(eq(settings.key, MASTER_KEY)).get();
  if (!row) return null;
  return decrypt(JSON.parse(row.value) as Sealed);
}

export type CredentialRow = {
  id: number;
  site: string;
  host: string;
  username: string;
  createdAt: string;
  lastUsedAt: string | null;
  notes: string | null;
};

export function listCredentials(): CredentialRow[] {
  return db
    .select({
      id: siteCredentials.id,
      site: siteCredentials.site,
      host: siteCredentials.host,
      username: siteCredentials.username,
      createdAt: siteCredentials.createdAt,
      lastUsedAt: siteCredentials.lastUsedAt,
      notes: siteCredentials.notes,
    })
    .from(siteCredentials)
    .orderBy(siteCredentials.site)
    .all();
}

// Store a credential. Password defaults to the master password (uniform, as
// the user chose) but can be overridden per site.
export function addCredential(args: {
  site: string;
  host: string;
  username: string;
  password?: string;
  notes?: string;
}): { ok: true; id: number } | { ok: false; error: string } {
  const password = args.password ?? getMasterPassword();
  if (!password) {
    return { ok: false, error: "Set a master password first." };
  }
  const sealed = encrypt(password);
  try {
    const res = db
      .insert(siteCredentials)
      .values({
        site: args.site,
        host: args.host,
        username: args.username,
        passwordEnc: sealed.cipherText,
        iv: sealed.iv,
        authTag: sealed.authTag,
        notes: args.notes ?? null,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();
    if (res.changes === 0) {
      return { ok: false, error: "A credential for that host + email already exists." };
    }
    return { ok: true, id: Number(res.lastInsertRowid) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to store" };
  }
}

export function revealCredential(id: number): string | null {
  const row = db.select().from(siteCredentials).where(eq(siteCredentials.id, id)).get();
  if (!row) return null;
  return decrypt({ iv: row.iv, authTag: row.authTag, cipherText: row.passwordEnc });
}

// For apply-assist: find an existing account for a host (any username).
export function credentialForHost(
  host: string,
): { username: string; password: string } | null {
  const row = db.select().from(siteCredentials).where(eq(siteCredentials.host, host)).get();
  if (!row) return null;
  return {
    username: row.username,
    password: decrypt({ iv: row.iv, authTag: row.authTag, cipherText: row.passwordEnc }),
  };
}

export function markCredentialUsed(id: number): void {
  db.update(siteCredentials)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(siteCredentials.id, id))
    .run();
}

export function deleteCredential(id: number): void {
  db.delete(siteCredentials).where(eq(siteCredentials.id, id)).run();
}
