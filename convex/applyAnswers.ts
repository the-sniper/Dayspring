import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { owned, requireUser } from "./lib";

// The screening-question answer bank. Populated when the user approves an
// application (whatever is on the form at approval time is, by definition,
// their answer) and consulted by the fill pass before the AI fallback — so a
// question answered once is answered forever.

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("applyAnswers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(500);
    return rows.map((r) => ({
      id: r._id,
      key: r.key,
      question: r.question,
      answer: r.answer,
      // Absent on rows banked before meaning-classes existed; the caller
      // recomputes when they're missing.
      reusable: r.reusable,
      qclass: r.qclass,
      updatedAt: r.updatedAt,
    }));
  },
});

export const upsert = mutation({
  args: {
    key: v.string(),
    question: v.string(),
    answer: v.string(),
    // Optional so any older caller keeps working; lib/apply/answers.ts always
    // sends both.
    reusable: v.optional(v.boolean()),
    qclass: v.optional(v.string()),
  },
  handler: async (ctx, { key, question, answer, reusable, qclass }) => {
    const userId = await requireUser(ctx);
    if (!key.trim() || !answer.trim()) return;
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("applyAnswers")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        question,
        answer,
        reusable,
        qclass,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("applyAnswers", {
        userId,
        key,
        question: question.slice(0, 300),
        answer: answer.slice(0, 1000),
        reusable,
        qclass,
        updatedAt: now,
      });
    }
  },
});

export const remove = mutation({
  args: { id: v.id("applyAnswers") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const row = owned(await ctx.db.get(id), userId);
    if (row) await ctx.db.delete(id);
  },
});
