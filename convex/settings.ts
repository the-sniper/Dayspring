import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Key-value settings. Sensitive values (API keys, master password) arrive
// pre-sealed (AES-256-GCM) from lib/keys.ts / lib/vault — this layer only
// stores opaque strings, exactly like the old SQLite settings table.

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return row ? row.value : null;
  },
});

// Batch read — one round-trip for callers that need several keys (e.g. the
// per-request settings snapshot in lib/settings/store.ts).
export const getMany = query({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const out: Record<string, string> = {};
    for (const key of keys) {
      const row = await ctx.db
        .query("settings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (row) out[key] = row.value;
    }
    return out;
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("settings").collect();
    const out: Record<string, string> = {};
    for (const row of rows) out[row.key] = row.value;
    return out;
  },
});

export const set = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const now = new Date().toISOString();
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row) await ctx.db.patch(row._id, { value, updatedAt: now });
    else await ctx.db.insert("settings", { key, value, updatedAt: now });
  },
});

export const remove = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
