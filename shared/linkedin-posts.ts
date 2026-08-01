// Shared constants for the LinkedIn-post feed source. Lives in shared/ so both
// Convex functions and the Next app read the same values.
import { ROLE_TYPE_LABELS, type RoleType } from "./role-types";

// Post bodies are stored on the row (no side table), so they need a hard cap.
// Long LinkedIn posts run ~3k characters; 4k keeps the whole hiring pitch
// without letting a copy-pasted essay bloat every feed scan.
export const POST_TEXT_LIMIT = 4000;

// new = awaiting triage, saved = promoted into the pipeline, done = reviewed /
// handled by the user, ignored = dismissed OR judged non-hiring by the
// extractor. Pull dedupes on externalId across every status, so done/ignored/
// saved posts never reappear on the untriaged feed after a later search.
export const POST_STATUSES = ["new", "saved", "done", "ignored"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_QUERIES_KEY = "linkedinPostQueries";

// Hiring phrasing people actually use in posts. Combined with the user's role
// types to form the default search set.
const HIRING_PHRASES = ["hiring", "we're hiring", "open role"];

// Fallback when onboarding recorded no role types — generic tech hiring posts.
const GENERIC_QUERIES = [
  "hiring software engineer",
  "we're hiring engineer",
  "open role engineer",
];

// Default search terms: each preferred role crossed with a hiring phrase, so a
// user who picked Frontend + Data searches "hiring Frontend", "hiring Data", …
// Capped so a user who selected every role type doesn't fan out into dozens of
// paid provider calls per pull.
export const MAX_POST_QUERIES = 8;

// Page-size choices for /feed/posts. Live in shared/ (not a "use client" file)
// so the RSC page can import them without crossing the client boundary — that
// crossing was racing Fast Refresh and throwing intermittent
// "Cannot read properties of undefined (reading 'length')" on the server.
export const POST_PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_POST_PAGE_SIZE = 20;

// Sort choices for /feed/posts. Same shared/ rule as page sizes — the RSC page
// must not import these from a "use client" module.
export const POST_SORT_OPTIONS = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["reactions", "Most reactions"],
  ["company", "Company A–Z"],
] as const;
export type PostSort = (typeof POST_SORT_OPTIONS)[number][0];
export const DEFAULT_POST_SORT: PostSort = "newest";

export function defaultPostQueries(roleTypes: string[]): string[] {
  const roles = roleTypes.filter(
    (r): r is RoleType => r in ROLE_TYPE_LABELS,
  );
  if (roles.length === 0) return GENERIC_QUERIES;
  const out: string[] = [];
  for (const phrase of HIRING_PHRASES) {
    for (const role of roles) {
      if (out.length >= MAX_POST_QUERIES) return out;
      out.push(`${phrase} ${ROLE_TYPE_LABELS[role]}`);
    }
  }
  return out;
}

// Queries are persisted as a comma-separated settings value (same shape as the
// ADZUNA_QUERIES env var) so the UI can round-trip them through a text input.
export function parsePostQueries(raw: string | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, MAX_POST_QUERIES);
}

// ---- apply-link extraction -----------------------------------------------
// Pure helpers shared by the AI extractor (Next) and the Convex feed mapper so
// already-stored posts without a persisted jobUrl still surface lnkd.in / ATS
// links that are plainly in the body.

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

function tidyUrl(url: string): string {
  return url.replace(/[.,;:!?)\]}'"]+$/, "");
}

// LinkedIn short links (lnkd.in), ATS hosts, and /jobs/ paths are application
// links. linkedin.com/in and /company are navigation and are dropped earlier.
export function isClearApplyLink(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "lnkd.in" || host.endsWith(".lnkd.in")) return true;
    if (
      /greenhouse|lever\.co|ashbyhq|ashby|workday|myworkdayjobs/i.test(host)
    ) {
      return true;
    }
    if (/^(jobs|careers|apply)\./i.test(host) || /\.(jobs|careers)$/i.test(host)) {
      return true;
    }
    if (host.endsWith("linkedin.com") && /\/jobs?\//i.test(u.pathname)) {
      return true;
    }
    return /\/jobs?\//i.test(u.pathname);
  } catch {
    return false;
  }
}

// Candidate apply links in a post, most-likely-first. LinkedIn profile/company
// URLs are dropped: they are navigation, not applications.
export function applyLinkCandidates(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.match(URL_RE) ?? []) {
    const url = tidyUrl(match);
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    // linkedin.com/jobs/view/… IS an application link; /in/ and /company/ are not.
    if (host.endsWith("linkedin.com") && !/\/jobs?\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out.sort(
    (a, b) => Number(isClearApplyLink(b)) - Number(isClearApplyLink(a)),
  );
}

// Prefer the model's pick when it lands on a listed candidate; otherwise take
// the strongest clear apply link in the body (so lnkd.in "Apply here" links
// still surface when the model returns -1).
export function pickApplyLink(
  text: string,
  preferredIndex?: number | null,
): string | null {
  const candidates = applyLinkCandidates(text);
  if (
    preferredIndex != null &&
    Number.isInteger(preferredIndex) &&
    preferredIndex >= 0 &&
    preferredIndex < candidates.length
  ) {
    return candidates[preferredIndex];
  }
  return candidates.find(isClearApplyLink) ?? null;
}
