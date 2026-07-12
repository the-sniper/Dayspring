// Server-side Convex access for RSC pages, server actions, and the Next-free
// CLI/MCP cores. Every call attaches the caller's auth token so Convex scopes
// data to the signed-in user:
//   - In a Next request: the Convex Auth JWT from the request cookies.
//   - In CLI scripts: a token obtained by signing in with env credentials
//     (see lib/convex/cli-auth.ts), registered via setCliAuthToken.
// Scripts must load .env.local (lib/env.ts) before import.
import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { api } from "@/convex/_generated/api";

let cliToken: string | null = null;

export function setCliAuthToken(token: string | null): void {
  cliToken = token;
}

async function authToken(): Promise<string | null> {
  if (cliToken) return cliToken;
  try {
    // Only resolvable inside a Next.js request (reads the session cookie set
    // by convexAuthNextjsMiddleware). Outside a request scope this throws and
    // we proceed unauthenticated — Convex then rejects data access.
    const { convexAuthNextjsToken } = await import(
      "@convex-dev/auth/nextjs/server"
    );
    return (await convexAuthNextjsToken()) ?? null;
  } catch {
    return null;
  }
}

// Stable per-user namespace for in-process caches (settings, decrypted keys).
// Derived from the JWT subject so it survives token refreshes. NEVER share
// cached per-user values across scopes — that would leak data between users.
export async function cacheScope(): Promise<string> {
  const token = await authToken();
  if (!token) return "anon";
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    ) as { sub?: string };
    return String(payload.sub ?? "anon").split("|")[0];
  } catch {
    return "anon";
  }
}

function makeClient(token: string | null): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set — run `npx convex dev` to configure a deployment.",
    );
  }
  const client = new ConvexHttpClient(url);
  if (token) client.setAuth(token);
  return client;
}

// Same query/mutation/action surface as ConvexHttpClient, but resolves the
// caller's token per call (tokens are per-request, the process is shared).
class AuthedConvexClient {
  async query<Q extends FunctionReference<"query">>(
    query: Q,
    ...args: OptionalRestArgs<Q>
  ): Promise<FunctionReturnType<Q>> {
    return makeClient(await authToken()).query(query, ...args);
  }

  async mutation<M extends FunctionReference<"mutation">>(
    mutation: M,
    ...args: OptionalRestArgs<M>
  ): Promise<FunctionReturnType<M>> {
    return makeClient(await authToken()).mutation(mutation, ...args);
  }

  async action<A extends FunctionReference<"action">>(
    action: A,
    ...args: OptionalRestArgs<A>
  ): Promise<FunctionReturnType<A>> {
    return makeClient(await authToken()).action(action, ...args);
  }
}

const singleton = new AuthedConvexClient();

export function convex(): AuthedConvexClient {
  return singleton;
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
