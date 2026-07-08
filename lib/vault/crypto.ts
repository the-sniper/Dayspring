import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// AES-256-GCM at rest. The 32-byte key is derived from DAYSPRING_VAULT_KEY via
// scrypt; the passphrase lives only in .env.local (gitignored). Without it, all
// vault features are hard-disabled — we never store plaintext.

export function hasVaultKey(): boolean {
  return !!process.env.DAYSPRING_VAULT_KEY;
}

function deriveKey(): Buffer {
  const secret = process.env.DAYSPRING_VAULT_KEY;
  if (!secret) throw new Error("DAYSPRING_VAULT_KEY is not set");
  // Fixed salt is acceptable here: the security boundary is the secret itself
  // (a local .env value), not a password DB. scrypt hardens a weak passphrase.
  return scryptSync(secret, "dayspring-vault-v1", 32);
}

export type Sealed = { iv: string; authTag: string; cipherText: string };

export function encrypt(plaintext: string): Sealed {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    cipherText: cipherText.toString("base64"),
  };
}

export function decrypt(sealed: Sealed): string {
  const key = deriveKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(sealed.cipherText, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
