// Server-side Convex access for RSC pages, server actions, and the Next-free
// CLI/MCP cores. Uses ConvexHttpClient (async, one round-trip per call) against
// the deployment URL. Scripts must load .env.local (lib/env.ts) before import.
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

let cached: ConvexHttpClient | null = null;

export function convex(): ConvexHttpClient {
  if (!cached) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error(
        "NEXT_PUBLIC_CONVEX_URL is not set — run `npx convex dev` to configure a deployment.",
      );
    }
    cached = new ConvexHttpClient(url);
  }
  return cached;
}

export { api };

// ---- Convex File Storage (PDF bytes — no writable disk on hosted) ---------

export async function uploadPdfToStorage(bytes: Uint8Array): Promise<string> {
  const uploadUrl = await convex().mutation(api.resumes.generateUploadUrl, {});
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: bytes as BodyInit,
  });
  if (!res.ok) throw new Error(`Convex storage upload failed: HTTP ${res.status}`);
  const { storageId } = (await res.json()) as { storageId: string };
  return storageId;
}

export async function storageFileUrl(fileId: string): Promise<string | null> {
  return await convex().query(api.resumes.fileUrl, { fileId: fileId as never });
}

export async function fetchStorageBytes(fileId: string): Promise<Buffer | null> {
  const url = await storageFileUrl(fileId);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// Convex rejects explicit `null`/`undefined` for optional fields — strip them
// so unset columns are simply absent (which reads back as null via `?? null` in
// query mappers). Use when building any insert/patch doc from nullable inputs.
export function cleanDoc<T extends Record<string, unknown>>(doc: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(doc)) {
    if (val !== null && val !== undefined) out[k] = val;
  }
  return out as Partial<T>;
}
