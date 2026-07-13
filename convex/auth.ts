import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { bootstrapNewUser } from "./onboarding";
import { requireUser } from "./lib";

// Two ways in: email/password (with a display name captured at signup) and
// Google OAuth. Google needs AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET set on the
// Convex deployment (a "Web application" OAuth client with the deployment's
// .convex.site callback URL — see README/settings).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = params.email as string;
        return {
          email,
          // Signup form sends a display name; fall back to the mailbox part.
          name: (params.name as string) || email.split("@")[0],
        };
      },
    }),
    Google,
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      // Brand-new account: seed the catalog + kick off a background job pull.
      if (existingUserId !== null) return;
      await bootstrapNewUser(ctx, userId);
      await ctx.scheduler.runAfter(0, internal.pull.pullForUser, { userId });
    },
  },
});

// Idempotent backfill for accounts created before auto-onboarding shipped.
export const ensureOnboarded = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let seeded = false;
    let pullScheduled = false;
    if (companies.length === 0) {
      await bootstrapNewUser(ctx, userId);
      seeded = true;
    }
    if (jobs.length === 0) {
      await ctx.scheduler.runAfter(0, internal.pull.pullForUser, { userId });
      pullScheduled = true;
    }
    return { seeded, pullScheduled, companyCount: companies.length, jobCount: jobs.length };
  },
});
