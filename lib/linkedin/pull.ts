// Next-free pull core for the LinkedIn-post source — shared by the UI server
// action, the daily CLI script, and the hosted cron route. Nothing in this
// import chain may touch next/* APIs.
//
// Mirrors lib/jobs/pull.ts in spirit but is deliberately separate: the two
// sources have different providers, different cost models, and different
// destination tables.
import { hasApiKey } from "@/lib/claude/client";
import { hasOpenAIKey } from "@/lib/ai/openai";
import { api, cleanDoc, convex } from "@/lib/convex/server";
import {
  fetchLinkedinPosts,
  hasLinkedinPostsKey,
  type LinkedinPost,
} from "@/lib/integrations/linkedin/posts";
import {
  EXTRACT_BATCH_LIMIT,
  extractPosts,
  type PostExtraction,
} from "@/lib/linkedin/extract";
import { getSetting, setSetting } from "@/lib/settings/store";
import { isPastRetention } from "@/shared/job-retention";
import {
  MAX_POST_QUERIES,
  POST_QUERIES_KEY,
  defaultPostQueries,
  parsePostQueries,
} from "@/shared/linkedin-posts";

// Convex caps writes per second; posts are smaller than JDs but a wide search
// can still return hundreds at once. Same chunk-and-pace shape as the ATS pull.
const UPSERT_CHUNK = 20;
const MAX_NEW_POSTS_PER_PULL = 300;

export const LAST_POST_PULL_KEY = "lastLinkedinPostPullAt";

export type PostPullResult = {
  fetched: number;
  added: number;
  // Of the added rows, how many are actual hiring posts (the rest were stored
  // as `ignored` so they are never re-classified).
  hiring: number;
  // Already-seen posts skipped before any model call.
  duplicates: number;
  extracted: number;
  queries: string[];
  errors: { query: string; message: string }[];
  limitReached: boolean;
};

// The user's saved search terms, or role-derived defaults when unset.
export async function getPostQueries(): Promise<string[]> {
  const saved = parsePostQueries(await getSetting(POST_QUERIES_KEY));
  if (saved.length > 0) return saved;
  const onboarding = await convex().query(api.onboarding.status, {});
  const roles = Array.isArray(onboarding?.prefs?.roleTypes)
    ? onboarding.prefs.roleTypes
    : [];
  return defaultPostQueries(roles);
}

export async function setPostQueries(raw: string): Promise<string[]> {
  const queries = parsePostQueries(raw);
  await setSetting(POST_QUERIES_KEY, queries.join(", "));
  return queries;
}

export async function getLastPostPullAt(): Promise<string | null> {
  return await getSetting(LAST_POST_PULL_KEY);
}

async function insertChunked(
  docs: unknown[],
): Promise<{ addedIds: string[]; limitReached: boolean }> {
  const addedIds: string[] = [];
  for (let i = 0; i < docs.length && addedIds.length < MAX_NEW_POSTS_PER_PULL; ) {
    const remaining = MAX_NEW_POSTS_PER_PULL - addedIds.length;
    const chunk = docs.slice(i, i + Math.min(UPSERT_CHUNK, remaining));
    i += chunk.length;
    let attempt = 0;
    for (;;) {
      try {
        const { insertedIds } = await convex().mutation(
          api.linkedinPosts.upsertBatch,
          { docs: chunk },
        );
        addedIds.push(...insertedIds);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const cause = err instanceof Error ? String(err.cause ?? "") : "";
        const transient =
          /TooManyWrites|Too many writes/i.test(msg) ||
          /fetch failed|other side closed|ECONNRESET|UND_ERR_SOCKET|network/i.test(
            `${msg} ${cause}`,
          );
        if (attempt < 5 && transient) {
          attempt++;
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw err;
      }
    }
    if (i < docs.length) await new Promise((r) => setTimeout(r, 150));
  }
  // Only the cap counts as "limit reached" — rows skipped as duplicates by the
  // mutation are not a truncated run.
  return { addedIds, limitReached: docs.length > MAX_NEW_POSTS_PER_PULL };
}

// Drop posts already stored, in batches — existingIds does one indexed lookup
// per id, so the whole candidate set is not sent in a single query.
async function newPostsOnly(posts: LinkedinPost[]): Promise<LinkedinPost[]> {
  const seen = new Set<string>();
  for (let i = 0; i < posts.length; i += 100) {
    const slice = posts.slice(i, i + 100);
    const found = await convex().query(api.linkedinPosts.existingIds, {
      externalIds: slice.map((p) => p.externalId),
    });
    for (const id of found) seen.add(id);
  }
  return posts.filter((p) => !seen.has(p.externalId));
}

export async function pullLinkedinPosts(): Promise<PostPullResult> {
  const queries = (await getPostQueries()).slice(0, MAX_POST_QUERIES);
  const result: PostPullResult = {
    fetched: 0,
    added: 0,
    hiring: 0,
    duplicates: 0,
    extracted: 0,
    queries,
    errors: [],
    limitReached: false,
  };
  if (!(await hasLinkedinPostsKey()) || queries.length === 0) return result;

  const { posts, errors } = await fetchLinkedinPosts(queries);
  result.fetched = posts.length;
  result.errors = errors;
  if (posts.length === 0) {
    await setSetting(LAST_POST_PULL_KEY, new Date().toISOString());
    return result;
  }

  // Drop anything already past the portal-wide age ceiling before we spend a
  // model call — Convex upsert would refuse them anyway.
  const nowIso = new Date().toISOString();
  const withinAge = posts.filter(
    (p) => !isPastRetention({ postedAt: p.postedAt, createdAt: nowIso }),
  );
  const fresh = await newPostsOnly(withinAge);
  result.duplicates = posts.length - fresh.length;

  // Extraction is what makes a post usable (company, titles, apply link), but
  // it needs a model key. Without one the raw posts are still stored so the
  // author's text and permalink are readable — nothing is silently dropped.
  const canExtract = (await hasApiKey()) || (await hasOpenAIKey());
  const now = new Date().toISOString();
  const docs: Record<string, unknown>[] = [];

  for (let i = 0; i < fresh.length; i += EXTRACT_BATCH_LIMIT) {
    const batch = fresh.slice(i, i + EXTRACT_BATCH_LIMIT);
    let extractions: (PostExtraction | null)[] = batch.map(() => null);
    if (canExtract) {
      try {
        extractions = await extractPosts(batch);
      } catch (err) {
        // Non-fatal, exactly like the pull's role classification: the posts
        // land unextracted and can be re-triaged by hand.
        result.errors.push({
          query: batch[0]?.query ?? "(extraction)",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    for (let j = 0; j < batch.length; j++) {
      const post = batch[j];
      const ex = extractions[j];
      if (ex) result.extracted++;
      // Non-hiring posts are stored as `ignored`: hidden from the feed, but
      // recorded so the next pull skips them before paying for extraction.
      const isHiring = ex ? ex.isHiring : true;
      docs.push(
        cleanDoc({
          externalId: post.externalId,
          postUrl: post.postUrl,
          authorName: post.authorName,
          authorHeadline: post.authorHeadline,
          authorProfileUrl: post.authorProfileUrl,
          text: post.text,
          postedAt: post.postedAt,
          reactions: post.reactions,
          query: post.query,
          companyName: ex?.companyName ?? null,
          roleTitles: ex && ex.roleTitles.length > 0 ? ex.roleTitles : null,
          location: ex?.location ?? null,
          jobUrl: ex?.jobUrl ?? null,
          extractedAt: ex ? now : null,
          status: isHiring ? "new" : "ignored",
          createdAt: now,
          updatedAt: now,
        }),
      );
      if (isHiring) result.hiring++;
    }
  }

  const { addedIds, limitReached } = await insertChunked(docs);
  result.added = addedIds.length;
  result.limitReached = limitReached;
  // `hiring` counts what we prepared; if the cap truncated the insert, report
  // no more than what actually landed.
  result.hiring = Math.min(result.hiring, result.added);
  await setSetting(LAST_POST_PULL_KEY, new Date().toISOString());
  return result;
}
