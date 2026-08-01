// LinkedIn post-search client — the feed's second source. LinkedIn publishes no
// post-search API, so this goes through an Apify actor. One synchronous REST
// call per search term (run-sync-get-dataset-items runs the actor and returns
// its dataset in the same response), matching the hand-rolled fetch style of
// the other integrations — no SDK.
//
// Unlike Adzuna, the token is per-user (Settings → API Keys) rather than a bare
// env var, because scraping runs cost the key's owner money.
import { getKey } from "@/lib/keys";
import { keyNotSet } from "@/lib/keys/messages";
import { POST_TEXT_LIMIT } from "@/shared/linkedin-posts";

export type LinkedinPost = {
  externalId: string;
  postUrl: string;
  authorName: string;
  authorHeadline: string | null;
  authorProfileUrl: string | null;
  text: string;
  postedAt: string | null;
  reactions: number | null;
  // Which search term surfaced this post.
  query: string;
};

// Actors are third-party and their input/output shapes drift, so the actor id
// is overridable and the normalizer below reads field aliases rather than one
// fixed schema.
//
// Default: harvestapi's keyword post search — by far the most-run one that
// needs no LinkedIn cookie or account (many post scrapers require pasting your
// own `li_at` session cookie, which is a much bigger risk to the user).
const DEFAULT_ACTOR = "harvestapi~linkedin-post-search";

export async function hasLinkedinPostsKey(): Promise<boolean> {
  return !!(await getKey("APIFY_API_TOKEN"));
}

function config() {
  return {
    actor: process.env.LINKEDIN_POSTS_ACTOR?.trim() || DEFAULT_ACTOR,
    maxDays: Number(process.env.LINKEDIN_POSTS_MAX_DAYS ?? 15) || 15,
    perQuery: Math.max(1, Number(process.env.LINKEDIN_POSTS_PER_QUERY ?? 25) || 25),
  };
}

// Actor payloads are `unknown` — these readers pull a value from the first
// matching key so a shape change degrades a field instead of throwing.
function str(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function num(raw: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function nested(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = raw[key];
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

// Actors emit dates as ISO strings, epoch millis, or LinkedIn's relative
// "2d" / "3 weeks ago" text. Only the first two are convertible; relative
// strings become null rather than a wrong absolute timestamp.
function isoDate(value: string | number | null): string | null {
  if (value === null) return null;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (/^\d+$/.test(value)) return isoDate(Number(value));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizePost(item: unknown, query: string): LinkedinPost | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const author = nested(raw, "author");
  const actor = nested(raw, "actor");
  // Some actors nest the timestamp and the counters instead of flattening them
  // (harvestapi: postedAt.date, engagement.likes).
  const postedAtObj = nested(raw, "postedAt");
  const engagement = nested(raw, "engagement");

  const text = str(raw, "text", "postText", "content", "description", "post_text");
  const postUrl = str(
    raw,
    "url",
    "postUrl",
    "post_url",
    "linkedinUrl",
    "link",
    "permalink",
  );
  if (!text || !postUrl) return null;

  // Prefer a provider id; the permalink is a stable fallback since LinkedIn
  // post URLs embed the activity URN.
  const externalId =
    str(raw, "id", "postId", "post_id", "urn", "activityUrn", "socialUrn") ??
    postUrl;

  const authorName =
    str(raw, "authorName", "author_name", "authorFullName", "profileName") ??
    str(author, "name", "fullName", "firstName") ??
    str(actor, "name", "fullName") ??
    "(unknown)";

  return {
    externalId,
    postUrl,
    authorName,
    authorHeadline:
      str(raw, "authorHeadline", "author_headline", "authorTitle", "headline") ??
      str(author, "headline", "occupation", "title", "info") ??
      str(actor, "description", "headline"),
    authorProfileUrl:
      str(raw, "authorProfileUrl", "author_profile_url", "authorUrl", "profileUrl") ??
      str(author, "url", "profileUrl", "publicUrl", "linkedinUrl") ??
      str(actor, "url"),
    text: text.slice(0, POST_TEXT_LIMIT),
    postedAt: isoDate(
      str(postedAtObj, "date", "timestamp") ??
        str(raw, "postedAt", "posted_at", "date", "publishedAt", "time", "timestamp"),
    ),
    reactions:
      num(
        raw,
        "numLikes",
        "likesCount",
        "reactionsCount",
        "totalReactionCount",
      ) ?? num(engagement, "likes", "reactions", "totalReactionCount"),
    query,
  };
}

// Input is built per actor rather than as a union of alias keys: actors validate
// against their declared schema, so an unknown key with an out-of-enum value
// (e.g. sortBy "date_posted" where only "date" is allowed) fails the whole run.
const INPUT_BUILDERS: Record<
  string,
  (query: string, cfg: ReturnType<typeof config>) => Record<string, unknown>
> = {
  "harvestapi~linkedin-post-search": (query, cfg) => ({
    searchQueries: [query],
    maxPosts: cfg.perQuery,
    postedLimit:
      cfg.maxDays <= 1
        ? "24h"
        : cfg.maxDays <= 7
          ? "week"
          : cfg.maxDays <= 31
            ? "month"
            : "3months",
    sortBy: "date",
  }),
  "datadoping~linkedin-posts-search-scraper": (query, cfg) => ({
    keywords: [query],
    max_posts: cfg.perQuery,
    sort_by: "date_posted",
    date_filter:
      cfg.maxDays <= 1 ? "past-24h" : cfg.maxDays <= 7 ? "past-week" : "past-month",
  }),
};

// Fallback for a custom LINKEDIN_POSTS_ACTOR: the two spellings of "search for
// these words" that post scrapers agree on, and nothing else — no guessed enum
// values that could fail validation.
function genericInput(
  query: string,
  cfg: ReturnType<typeof config>,
): Record<string, unknown> {
  return {
    searchQueries: [query],
    keywords: [query],
    maxPosts: cfg.perQuery,
  };
}

async function runActor(
  query: string,
  token: string,
  cfg: ReturnType<typeof config>,
): Promise<unknown[]> {
  const input = (INPUT_BUILDERS[cfg.actor] ?? genericInput)(query, cfg);
  const res = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(cfg.actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&clean=true`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(input),
      // Actor runs are slow (a browser boots server-side); the sync endpoint
      // holds the connection until the dataset is ready.
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `apify/${query}: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : [];
}

export type PostFetchResult = {
  posts: LinkedinPost[];
  // Per-query failures are reported, never thrown: one bad search term must
  // not lose the results of the others.
  errors: { query: string; message: string }[];
};

// Fetch across every search term, normalize, and dedupe by post id (hiring
// posts routinely match several terms).
export async function fetchLinkedinPosts(
  queries: string[],
): Promise<PostFetchResult> {
  const token = await getKey("APIFY_API_TOKEN");
  if (!token) throw new Error(keyNotSet("APIFY_API_TOKEN"));
  const cfg = config();
  const byId = new Map<string, LinkedinPost>();
  const errors: { query: string; message: string }[] = [];

  // Sequential on purpose: each actor run is a paid, heavyweight job, and
  // Apify limits concurrent runs on the free tier.
  for (const query of queries) {
    try {
      for (const item of await runActor(query, token, cfg)) {
        const post = normalizePost(item, query);
        if (post && !byId.has(post.externalId)) byId.set(post.externalId, post);
      }
    } catch (err) {
      errors.push({
        query,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { posts: [...byId.values()], errors };
}
