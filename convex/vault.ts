import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("siteCredentials").collect();
    return rows.map((r) => ({ ...r, id: r._id }));
  },
});

export const getByHostUsername = query({
  args: { host: v.string(), username: v.string() },
  handler: async (ctx, { host, username }) => {
    const row = await ctx.db
      .query("siteCredentials")
      .withIndex("by_host_username", (q) => q.eq("host", host).eq("username", username))
      .unique();
    return row ? { ...row, id: row._id } : null;
  },
});

export const getById = query({
  args: { id: v.id("siteCredentials") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    return row ? { ...row, id: row._id } : null;
  },
});

// First credential for a host (any username) — apply-assist account reuse.
export const byHost = query({
  args: { host: v.string() },
  handler: async (ctx, { host }) => {
    const row = await ctx.db
      .query("siteCredentials")
      .withIndex("by_host_username", (q) => q.eq("host", host))
      .first();
    return row ? { ...row, id: row._id } : null;
  },
});

// Insert-if-absent keyed on (host, username).
export const add = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => {
    const existing = await ctx.db
      .query("siteCredentials")
      .withIndex("by_host_username", (q) => q.eq("host", doc.host).eq("username", doc.username))
      .unique();
    if (existing) return { inserted: false as const, id: existing._id };
    const id = await ctx.db.insert("siteCredentials", doc);
    return { inserted: true as const, id };
  },
});

export const touch = mutation({
  args: { id: v.id("siteCredentials"), lastUsedAt: v.string() },
  handler: async (ctx, { id, lastUsedAt }) => {
    await ctx.db.patch(id, { lastUsedAt });
  },
});

export const remove = mutation({
  args: { id: v.id("siteCredentials") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
