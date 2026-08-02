import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, query } from "./_generated/server";

// The signed-in user's profile — name + email from Convex Auth's users table.
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      id: userId,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
    };
  },
});

export const listAllIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => u._id);
  },
});

// Resolve existing accounts by email, for the "cli" credentials provider in
// convex/auth.ts. internalQuery, so it is unreachable from any client — the only
// caller is the provider's authorize(), which has already checked the shared
// secret. Never creates anything: a script must attach to an account that
// already exists.
//
// Returns an ARRAY, not a single row. One email really can have several user
// documents: an OAuth sign-in and an unverified password signup do not link, so
// a stray signup leaves a duplicate behind forever. `.unique()` threw on that,
// which is honest but unhelpful — the caller needs to know which one holds the
// data before it can pick.
export const idsByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .collect();
    return users.map((u) => u._id);
  },
});

// How much data each candidate account actually owns. Used only to build a
// useful error message when an email resolves to more than one user — "this id
// has your 295 posts, that one is empty" is the fact you need to pick, and
// guessing on your behalf is the one thing this must not do.
const COUNTED = [
  "jobs",
  "linkedinPosts",
  "companies",
  "contacts",
  "masterResumes",
  "resumeAssets",
] as const;

export const summarize = internalQuery({
  args: { ids: v.array(v.id("users")) },
  handler: async (ctx, { ids }) => {
    const out: { id: string; email: string | null; counts: Record<string, number> }[] = [];
    for (const id of ids) {
      const user = await ctx.db.get(id);
      const counts: Record<string, number> = {};
      for (const table of COUNTED) {
        // take(200) rather than collect(): this only has to distinguish "has
        // data" from "empty", and an unbounded scan per table per candidate is
        // a silly price for that.
        const rows = await ctx.db
          .query(table)
          .withIndex("by_user", (q) => q.eq("userId", id))
          .take(200);
        if (rows.length > 0) counts[table] = rows.length;
      }
      out.push({ id, email: user?.email ?? null, counts });
    }
    return out;
  },
});

// Same summary, callable WITHOUT being signed in — gated by the CLI shared
// secret instead. This exists because of a chicken-and-egg: to pick the right
// account you need to see the accounts, but every normal query requires you to
// already be signed in as one of them. Powers `npm run whoami`.
//
// Read-only, returns ids and row counts and nothing else, and refuses entirely
// unless DAYSPRING_CLI_SECRET is set on the deployment.
export const candidates = query({
  args: { email: v.string(), secret: v.string() },
  handler: async (ctx, { email, secret }) => {
    const expected = process.env.DAYSPRING_CLI_SECRET;
    if (!expected || secret.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < secret.length; i++) {
      diff |= secret.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email.toLowerCase().trim()))
      .collect();
    const out: { id: string; email: string | null; counts: Record<string, number> }[] = [];
    for (const u of users) {
      const counts: Record<string, number> = {};
      for (const table of COUNTED) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_user", (q) => q.eq("userId", u._id))
          .take(200);
        if (rows.length > 0) counts[table] = rows.length;
      }
      out.push({ id: u._id, email: u.email ?? null, counts });
    }
    return out;
  },
});
