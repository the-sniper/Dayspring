import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Stagger per-user pulls so a large user base doesn't open every ATS board at once.
export const scheduleDailyPulls = internalAction({
  args: {},
  handler: async (ctx) => {
    const userIds = (await ctx.runQuery(internal.users.listAllIds, {})) as Id<"users">[];
    for (let i = 0; i < userIds.length; i++) {
      await ctx.scheduler.runAfter(i * 45_000, internal.pull.pullForUser, {
        userId: userIds[i],
      });
    }
    return { scheduled: userIds.length };
  },
});

const crons = cronJobs();

// 7:30 AM Eastern — pull fresh roles for every account (same cadence as local cron).
crons.cron(
  "daily job pull",
  "30 11 * * *",
  internal.crons.scheduleDailyPulls,
  {},
);

// 8:00 AM Eastern — hard retention: cascade-delete jobs + LinkedIn posts older
// than JOB_MAX_AGE_DAYS (shared/job-retention.ts). Runs after the pull so
// freshly ingested stale listings are swept the same morning.
crons.cron(
  "daily retention purge",
  "0 12 * * *",
  internal.retention.scheduleRetentionPurge,
  {},
);

export default crons;
