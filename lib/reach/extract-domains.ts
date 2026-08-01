import { cleanEmployerDomain, isJobBoardUrl } from "@/shared/job-boards";

// Pull plausible employer domains from job-page text. Never trusts the
// source URL host — that's almost always a job board (Greenhouse, Algora…).

export function extractCandidateDomains(
  text: string,
  sourceUrl?: string | null,
): string[] {
  const found = new Set<string>();

  // Emails in the posting often leak the employer domain.
  for (const m of text.matchAll(
    /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi,
  )) {
    add(found, m[1]);
  }

  // Explicit http(s) links in the body (company site, not the job URL host).
  for (const m of text.matchAll(/\bhttps?:\/\/([A-Z0-9.-]+\.[A-Z]{2,})(?:[^\s"'<>]*)/gi)) {
    const host = m[1];
    const full = m[0];
    // Skip links that are themselves job-board URLs.
    if (full && isJobBoardUrl(full.startsWith("http") ? full : `https://${full}`)) {
      continue;
    }
    add(found, host);
  }

  // Bare www. hosts.
  for (const m of text.matchAll(/\bwww\.([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)) {
    add(found, m[1]);
  }

  // Intentionally ignore sourceUrl host — e.g. algora.io/airspace-…/job/…
  void sourceUrl;

  return [...found];
}

function add(set: Set<string>, host: string | undefined) {
  const d = cleanEmployerDomain(host);
  if (!d) return;
  // Drop common non-employer noise.
  if (
    /(google\.com|facebook\.com|twitter\.com|x\.com|youtube\.com|apple\.com|microsoft\.com|schema\.org|w3\.org|cloudflare\.com|googleapis\.com)/i.test(
      d,
    )
  ) {
    return;
  }
  set.add(d);
}
