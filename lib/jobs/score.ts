// Next-free scoring orchestration — the future overnight cron and MCP layer
// call this directly, same as the pull core.
import { scoreJob } from "@/lib/claude/score";
import { api, convex } from "@/lib/convex/server";
import { getDefaultProfile, profileText } from "@/lib/profiles/core";
import { getSetting } from "@/lib/settings/store";

export const MIN_JD_CHARS = 200;
export const BATCH_LIMIT = 25;
const CONCURRENCY = 3;

// The default profile drives everything (M27). Falls back to the legacy
// settings.profile blob — getDefaultProfile() self-migrates it on first read.
export async function getProfile(): Promise<string | null> {
  const p = await getDefaultProfile();
  if (p && p.content.trim()) return profileText(p);
  const value = getSetting("profile")?.trim() ?? "";
  if (!value || value.startsWith("REPLACE ME")) return null;
  return value;
}

export type ScoreOneResult =
  | { ok: true; score: number }
  | { ok: false; error: string };

export async function scoreOneJob(
  jobId: string,
  force = false,
): Promise<ScoreOneResult> {
  const profile = await getProfile();
  if (!profile) {
    return { ok: false, error: "No profile yet — paste your resume in Settings first." };
  }
  const job = await convex().query(api.jobs.getWithCompany, { id: jobId as never });
  if (!job) return { ok: false, error: "Job not found" };
  if (job.matchScore !== null && job.matchScore !== undefined && !force) {
    return { ok: true, score: job.matchScore };
  }
  if (job.description.length < MIN_JD_CHARS) {
    return { ok: false, error: "Insufficient JD — add a description before scoring." };
  }

  const res = await scoreJob(profile, {
    title: job.title,
    companyName: job.companyName,
    location: job.location ?? null,
    description: job.description,
  });
  const now = new Date().toISOString();
  await convex().mutation(api.jobs.patch, {
    id: jobId as never,
    patch: {
      matchScore: res.score,
      fitSummary: res.fitSummary,
      gapNotes: res.gaps,
      scoredAt: now,
      updatedAt: now,
    },
  });
  return { ok: true, score: res.score };
}

export type BatchScoreResult = {
  scored: number;
  failed: number;
  skippedThinJd: number;
  remaining: number;
  tokens: { input: number; output: number };
  errors: string[];
};

export async function scoreUnscored(
  limit = BATCH_LIMIT,
): Promise<BatchScoreResult | { profileMissing: true }> {
  const profile = await getProfile();
  if (!profile) return { profileMissing: true };

  // Bounded server-side selection: the newest `limit` unscored new/wishlist
  // jobs with a long-enough JD (by cached jdChars), plus totals. Avoids pulling
  // the whole table into Node (Convex caps query results at 8192 rows).
  const { rows: candidates, total, skippedThinJd } = await convex().query(
    api.jobs.unscoredScorable,
    { limit, minJdChars: MIN_JD_CHARS },
  );

  const result: BatchScoreResult = {
    scored: 0,
    failed: 0,
    skippedThinJd,
    remaining: 0,
    tokens: { input: 0, output: 0 },
    errors: [],
  };

  // Hand-rolled promise pool — one slow JD never serializes the batch.
  let next = 0;
  const now = () => new Date().toISOString();
  async function worker() {
    while (next < candidates.length) {
      const job = candidates[next++];
      try {
        const description = await convex().query(api.jobs.getDescription, {
          id: job.id as never,
        });
        const res = await scoreJob(profile!, {
          title: job.title,
          companyName: job.companyName,
          location: job.location ?? null,
          description,
        });
        await convex().mutation(api.jobs.patch, {
          id: job.id as never,
          patch: {
            matchScore: res.score,
            fitSummary: res.fitSummary,
            gapNotes: res.gaps,
            scoredAt: now(),
            updatedAt: now(),
          },
        });
        result.scored++;
        result.tokens.input += res.tokens.input;
        result.tokens.output += res.tokens.output;
      } catch (err) {
        result.failed++;
        if (result.errors.length < 5) {
          result.errors.push(
            `${job.title}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker),
  );

  result.remaining = total - result.scored;
  return result;
}
