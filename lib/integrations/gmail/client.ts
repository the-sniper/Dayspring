import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { refreshAccessToken } from "./oauth";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

function getSetting(key: string): string | null {
  return (
    db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
  );
}

export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  email: string | null;
};

export function getGmailConfig(): GmailConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const refreshToken = getSetting("gmailRefreshToken");
  if (!refreshToken) return null;
  return { clientId, clientSecret, refreshToken, email: getSetting("gmailEmail") };
}

export function hasGmail(): boolean {
  return getGmailConfig() !== null;
}

export function hasGmailEnv(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

// Access-token cache survives HMR via globalThis, same trick as lib/db.
const globalForGmail = globalThis as unknown as {
  gmailToken?: { token: string; expiresAt: number };
};

async function getAccessToken(): Promise<string> {
  const cached = globalForGmail.gmailToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const config = getGmailConfig();
  if (!config) throw new Error("Gmail is not connected — run `npm run gmail:auth`.");
  const { accessToken, expiresIn } = await refreshAccessToken(config);
  globalForGmail.gmailToken = {
    token: accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return accessToken;
}

async function gmailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gmail${path.split("?")[0]}: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// RFC 2047 B-encoding — keeps any subject (emoji, names) wire-safe.
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function buildMime(args: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  return [
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${encodeHeader(args.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    args.body,
  ].join("\r\n");
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
}): Promise<{ id: string; threadId: string }> {
  const config = getGmailConfig();
  const from = config?.email ?? "me";
  const raw = toBase64Url(
    buildMime({ from, to: args.to, subject: args.subject, body: args.body }),
  );
  return gmailFetch<{ id: string; threadId: string }>("/messages/send", {
    method: "POST",
    body: JSON.stringify(
      args.threadId ? { raw, threadId: args.threadId } : { raw },
    ),
  });
}

export type ThreadMessage = {
  id: string;
  from: string;
  internalDate: number; // epoch ms
};

export async function getThread(threadId: string): Promise<ThreadMessage[]> {
  const data = await gmailFetch<{
    messages?: {
      id: string;
      internalDate?: string;
      payload?: { headers?: { name: string; value: string }[] };
    }[];
  }>(`/threads/${threadId}?format=metadata&metadataHeaders=From`);
  return (data.messages ?? []).map((m) => ({
    id: m.id,
    from:
      m.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value ??
      "",
    internalDate: Number(m.internalDate ?? 0),
  }));
}

export async function getProfile(): Promise<{ emailAddress: string }> {
  return gmailFetch<{ emailAddress: string }>("/profile");
}
