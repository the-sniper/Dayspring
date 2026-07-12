// Next-free vault operations — actions, apply.ts, and workday-signup all use
// this. The ONE master password (Tsenta-style): set once, reused for every
// generated site account.
//
// The master password lives in the Convex-backed settings store, AES-256-GCM
// sealed with the env-only DAYSPRING_VAULT_KEY before it leaves the process —
// Convex only stores ciphertext. Site-credential rows live in Convex too
// (passwords sealed the same way).
import { api, convex } from "@/lib/convex/server";
import { getSetting, setSetting } from "@/lib/settings/store";
import { decrypt, encrypt, hasVaultKey, type Sealed } from "@/lib/vault/crypto";

const MASTER_KEY = "masterPasswordEnc";

export async function hasMasterPassword(): Promise<boolean> {
  return hasVaultKey() && (await getSetting(MASTER_KEY)) !== null;
}

export async function setMasterPassword(password: string): Promise<void> {
  if (!password) throw new Error("Password required");
  const sealed = encrypt(password);
  await setSetting(MASTER_KEY, JSON.stringify(sealed));
}

export async function getMasterPassword(): Promise<string | null> {
  const raw = await getSetting(MASTER_KEY);
  if (!raw) return null;
  return decrypt(JSON.parse(raw) as Sealed);
}

export type CredentialRow = {
  id: string;
  site: string;
  host: string;
  username: string;
  createdAt: string;
  lastUsedAt: string | null;
  notes: string | null;
};

export async function listCredentials(): Promise<CredentialRow[]> {
  const rows = await convex().query(api.vault.list, {});
  return rows
    .map((r) => ({
      id: r.id,
      site: r.site,
      host: r.host,
      username: r.username,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt ?? null,
      notes: r.notes ?? null,
    }))
    .sort((a, b) => a.site.localeCompare(b.site));
}

// Store a credential. Password defaults to the master password (uniform, as
// the user chose) but can be overridden per site.
export async function addCredential(args: {
  site: string;
  host: string;
  username: string;
  password?: string;
  notes?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const password = args.password ?? (await getMasterPassword());
  if (!password) {
    return { ok: false, error: "Set a master password first." };
  }
  const sealed = encrypt(password);
  try {
    const res = await convex().mutation(api.vault.add, {
      doc: {
        site: args.site,
        host: args.host,
        username: args.username,
        passwordEnc: sealed.cipherText,
        iv: sealed.iv,
        authTag: sealed.authTag,
        notes: args.notes ?? undefined,
        createdAt: new Date().toISOString(),
      },
    });
    if (!res.inserted) {
      return { ok: false, error: "A credential for that host + email already exists." };
    }
    return { ok: true, id: res.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to store" };
  }
}

export async function revealCredential(id: string): Promise<string | null> {
  const row = await convex().query(api.vault.getById, { id: id as never });
  if (!row) return null;
  return decrypt({ iv: row.iv, authTag: row.authTag, cipherText: row.passwordEnc });
}

// For apply-assist: find an existing account for a host (any username).
export async function credentialForHost(
  host: string,
): Promise<{ username: string; password: string } | null> {
  const row = await convex().query(api.vault.byHost, { host });
  if (!row) return null;
  return {
    username: row.username,
    password: decrypt({ iv: row.iv, authTag: row.authTag, cipherText: row.passwordEnc }),
  };
}

export async function markCredentialUsed(id: string): Promise<void> {
  await convex().mutation(api.vault.touch, {
    id: id as never,
    lastUsedAt: new Date().toISOString(),
  });
}

export async function deleteCredential(id: string): Promise<void> {
  await convex().mutation(api.vault.remove, { id: id as never });
}
