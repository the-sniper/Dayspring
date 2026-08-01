// Fetch a public job posting URL and reduce it to plain text for AI parsing.
// Many ATS boards render enough content in the initial HTML; JS-only shells
// return thin text and the caller should fall back to a pasted description.

const MAX_CHARS = 24_000;
const FETCH_TIMEOUT_MS = 15_000;

export type FetchedJobPage = {
  url: string;
  text: string;
  title: string | null;
  truncated: boolean;
};

export async function fetchJobPage(rawUrl: string): Promise<FetchedJobPage> {
  const url = normalizeUrl(rawUrl);
  const res = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "Mozilla/5.0 (compatible; DayspringBot/0.1; +https://dayspring.app)",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Could not fetch that job link (HTTP ${res.status}).`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("text/plain") &&
    !contentType.includes("application/xhtml")
  ) {
    throw new Error("That link didn't return a readable job page.");
  }
  const html = await res.text();
  const title = extractTitle(html);
  const text = htmlToText(html);
  if (text.trim().length < 80) {
    throw new Error(
      "That page didn't expose enough text (likely JavaScript-only). Paste the job description below and try again.",
    );
  }
  const truncated = text.length > MAX_CHARS;
  return {
    url: res.url || url,
    text: truncated ? text.slice(0, MAX_CHARS) : text,
    title,
    truncated,
  };
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Paste a job link first.");
  let withScheme = trimmed;
  if (!/^https?:\/\//i.test(withScheme)) withScheme = `https://${withScheme}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) job links are supported.");
  }
  return parsed.toString();
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const t = m?.[1]?.replace(/\s+/g, " ").trim();
  return t || null;
}

function htmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n");
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : " ";
    });
  return s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
