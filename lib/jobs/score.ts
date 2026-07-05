// Next-free scoring orchestration — the future overnight cron and MCP layer
// call this directly, same as the pull core.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { scoreJob } from "@/lib/claude/score";
import { db } from "@/lib/db";
import { companies, jobs, settings } from "@/lib/db/schema";

export const MIN_JD_CHARS = 200;
export const BATCH_LIMIT = 25;
const CONCURRENCY = 3;

export function getProfile(): string | null {
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, "profile"))
    .get();
  const value = row?.value.trim() ?? "";
  if (!value || value.startsWith("REPLACE ME")) return null;
  return value;
}

export type ScoreOneResult =
  | { ok: true; score: number }
  | { ok: false; error: string };

export async function scoreOneJob(
  jobId: number,
  force = false,
): Promise<ScoreOneResult> {
  const profile = getProfile();
  if (!profile) {
    return { ok: false, error: "No profile yet — paste your resume in Settings first." };
  }
  const row = db
    .select({ job: jobs, companyName: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .get();
  if (!row) return { ok: false, error: "Job not found" };
  if (row.job.matchScore !== null && !force) return { ok: true, score: row.job.matchScore };
  if (row.job.description.length < MIN_JD_CHARS) {
    return { ok: false, error: "Insufficient JD — add a description before scoring." };
  }

  const res = await scoreJob(profile, {
    title: row.job.title,
    companyName: row.companyName,
    location: row.job.location,
    description: row.job.description,
  });
  db.update(jobs)
    .set({
      matchScore: res.score,
      fitSummary: res.fitSummary,
      gapNotes: res.gaps,
      scoredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId))
    .run();
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
  const profile = getProfile();
  if (!profile) return { profileMissing: true };

  const eligible = and(
    isNull(jobs.matchScore),
    inArray(jobs.status, ["new", "wishlist"]),
  );
  const candidates = db
    .select({ job: jobs, companyName: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(eligible, sql`length(${jobs.description}) >= ${MIN_JD_CHARS}`))
    .orderBy(sql`${jobs.createdAt} desc`)
    .limit(limit)
    .all();

  const skippedThinJd =
    db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(and(eligible, sql`length(${jobs.description}) < ${MIN_JD_CHARS}`))
      .get()?.n ?? 0;

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
      const { job, companyName } = candidates[next++];
      try {
        const res = await scoreJob(profile!, {
          title: job.title,
          companyName,
          location: job.location,
          description: job.description,
        });
        db.update(jobs)
          .set({
            matchScore: res.score,
            fitSummary: res.fitSummary,
            gapNotes: res.gaps,
            scoredAt: now(),
            updatedAt: now(),
          })
          .where(eq(jobs.id, job.id))
          .run();
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

  result.remaining =
    (db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(and(eligible, sql`length(${jobs.description}) >= ${MIN_JD_CHARS}`))
      .get()?.n ?? 0);
  return result;
}
