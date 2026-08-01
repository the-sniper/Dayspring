import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  JOB_MAX_AGE_DAYS,
  listingAgeIso,
  retentionCutoffIso,
} from "../shared/job-retention";
import { requireUser } from "./lib";

// Hard rule: delete jobs and LinkedIn posts older than JOB_MAX_AGE_DAYS.
// Scheduled daily via convex/crons.ts; also callable for the signed-in user
// from scripts/daily.ts. Batched + self-rescheduling so large tables finish
// without blowing a single mutation's write budget.

const JOB_BATCH = 25;
const POST_BATCH = 50;

async function deleteJobCascade(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"jobs">,
): Promise<boolean> {
  const job = await ctx.db.get(id);
  if (!job || job.userId !== userId) return false;

  const kids = [
    await ctx.db
      .query("stageEvents")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .collect(),
    await ctx.db
      .query("applications")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .collect(),
    await ctx.db
      .query("outreach")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .collect(),
    await ctx.db
      .query("researchBriefs")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .collect(),
    await ctx.db
      .query("generatedResumes")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .collect(),
    await ctx.db
      .query("jobDescriptions")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .collect(),
  ];
  for (const group of kids) {
    for (const row of group) {
      if ("pdfFileId" in row && row.pdfFileId) {
        await ctx.storage.delete(row.pdfFileId);
      }
      await ctx.db.delete(row._id);
    }
  }

  const queue = await ctx.db
    .query("applyQueue")
    .withIndex("by_user_job", (q) => q.eq("userId", userId).eq("jobId", id))
    .collect();
  for (const row of queue) await ctx.db.delete(row._id);

  await ctx.db.delete(id);
  return true;
}

async function purgeExpiredJobsForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  limit: number,
): Promise<{ deleted: number; done: boolean }> {
  const cutoff = retentionCutoffIso();
  const jobs = await ctx.db
    .query("jobs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const doomed = jobs
    .filter((j) => listingAgeIso(j) < cutoff)
    .sort((a, b) => listingAgeIso(a).localeCompare(listingAgeIso(b)))
    .slice(0, limit);

  let deleted = 0;
  for (const job of doomed) {
    if (await deleteJobCascade(ctx, userId, job._id)) deleted++;
  }
  return { deleted, done: doomed.length < limit };
}

async function purgeExpiredPostsForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  limit: number,
): Promise<{ deleted: number; done: boolean }> {
  const cutoff = retentionCutoffIso();
  const posts = await ctx.db
    .query("linkedinPosts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const doomed = posts
    .filter((p) => listingAgeIso(p) < cutoff)
    .sort((a, b) => listingAgeIso(a).localeCompare(listingAgeIso(b)))
    .slice(0, limit);

  for (const post of doomed) await ctx.db.delete(post._id);
  return { deleted: doomed.length, done: doomed.length < limit };
}

// One user, one bounded batch of jobs + posts. Self-reschedules when more
// remain so a heavy account still drains overnight without a stuck chain.
export const purgeExpiredForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const jobs = await purgeExpiredJobsForUser(ctx, userId, JOB_BATCH);
    const posts = await purgeExpiredPostsForUser(ctx, userId, POST_BATCH);
    const done = jobs.done && posts.done;
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.retention.purgeExpiredForUser, {
        userId,
      });
    }
    return {
      maxAgeDays: JOB_MAX_AGE_DAYS,
      jobsDeleted: jobs.deleted,
      postsDeleted: posts.deleted,
      done,
    };
  },
});

// Cron entrypoint: stagger one purge chain per account (same shape as pulls).
export const scheduleRetentionPurge = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds = (await ctx.runQuery(internal.users.listAllIds, {})) as Id<"users">[];
    for (let i = 0; i < userIds.length; i++) {
      await ctx.scheduler.runAfter(
        i * 15_000,
        internal.retention.purgeExpiredForUser,
        { userId: userIds[i] },
      );
    }
    return { scheduled: userIds.length, maxAgeDays: JOB_MAX_AGE_DAYS };
  },
});

// Signed-in user's own purge — used by scripts/daily.ts and as a safety valve
// from the Next app if needed. Same batching/self-reschedule as the cron path.
export const purgeMyExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const jobs = await purgeExpiredJobsForUser(ctx, userId, JOB_BATCH);
    const posts = await purgeExpiredPostsForUser(ctx, userId, POST_BATCH);
    const done = jobs.done && posts.done;
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.retention.purgeExpiredForUser, {
        userId,
      });
    }
    return {
      maxAgeDays: JOB_MAX_AGE_DAYS,
      jobsDeleted: jobs.deleted,
      postsDeleted: posts.deleted,
      done,
    };
  },
});
