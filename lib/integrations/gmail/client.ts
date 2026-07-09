import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { htmlToText } from "@/lib/html";
import { getKey } from "@/lib/keys";
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
  const clientId = getKey("GOOGLE_CLIENT_ID");
  const clientSecret = getKey("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const refreshToken = getSetting("gmailRefreshToken");
  if (!refreshToken) return null;
  return { clientId, clientSecret, refreshToken, email: getSetting("gmailEmail") };
}

export function hasGmail(): boolean {
  return getGmailConfig() !== null;
}

// Are OAuth client credentials available (env or Settings → API Keys)?
export function hasGmailEnv(): boolean {
  return !!getKey("GOOGLE_CLIENT_ID") && !!getKey("GOOGLE_CLIENT_SECRET");
}

// Access-token cache survives HMR via globalThis, same trick as lib/db.
const globalForGmail = globalThis as unknown as {
  gmailToken?: { token: string; expiresAt: number };
};

async function getAccessToken(): Promise<string> {
  const cached = globalForGmail.gmailToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const config = getGmailConfig();
  if (!config) throw new Error("Gmail is not connected — use Connect Gmail in Settings.");
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

function fromBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf-8");
}

// List message ids matching an RFC 5322 search query (e.g.
// "newer_than:1h in:inbox verification"). Read-only; uses gmail.readonly.
export async function listMessages(
  query: string,
  max = 15,
): Promise<{ id: string; threadId: string }[]> {
  const data = await gmailFetch<{
    messages?: { id: string; threadId: string }[];
  }>(`/messages?q=${encodeURIComponent(query)}&maxResults=${max}`);
  return data.messages ?? [];
}

export type GmailMessage = {
  id: string;
  from: string;
  subject: string;
  internalDate: number; // epoch ms
  text: string; // decoded plain-text body (html stripped as fallback)
};

type RawPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: RawPart[];
};

// Depth-first collect the best text body: prefer text/plain, fall back to
// stripped text/html.
function extractText(payload: RawPart | undefined): string {
  if (!payload) return "";
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: RawPart) => {
    if (p.body?.data) {
      const decoded = fromBase64Url(p.body.data);
      if (p.mimeType === "text/plain") plain.push(decoded);
      else if (p.mimeType === "text/html") html.push(decoded);
    }
    for (const child of p.parts ?? []) walk(child);
  };
  walk(payload);
  if (plain.length) return plain.join("\n");
  if (html.length) return htmlToText(html.join("\n"));
  return "";
}

export async function getMessage(id: string): Promise<GmailMessage> {
  const data = await gmailFetch<{
    id: string;
    internalDate?: string;
    snippet?: string;
    payload?: RawPart & { headers?: { name: string; value: string }[] };
  }>(`/messages/${id}?format=full`);
  const headers = data.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  return {
    id: data.id,
    from: header("from"),
    subject: header("subject"),
    internalDate: Number(data.internalDate ?? 0),
    text: extractText(data.payload) || (data.snippet ?? ""),
  };
}
