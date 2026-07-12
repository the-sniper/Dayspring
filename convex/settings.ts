import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib";

// Per-user key-value settings. Sensitive values (API keys, master password)
// arrive pre-sealed (AES-256-GCM) from lib/keys.ts / lib/vault — this layer
// only stores opaque strings, exactly like the old SQLite settings table.

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    return row ? row.value : null;
  },
});

export const set = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const userId = await requireUser(ctx);
    const now = new Date().toISOString();
    const row = await ctx.db
      .query("settings")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    if (row) await ctx.db.patch(row._id, { value, updatedAt: now });
    else await ctx.db.insert("settings", { userId, key, value, updatedAt: now });
  },
});

export const remove = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
