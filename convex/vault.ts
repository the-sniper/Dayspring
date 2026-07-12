import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { owned, requireUser } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("siteCredentials")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({ ...r, id: r._id }));
  },
});

export const getByHostUsername = query({
  args: { host: v.string(), username: v.string() },
  handler: async (ctx, { host, username }) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db
      .query("siteCredentials")
      .withIndex("by_user_host", (q) => q.eq("userId", userId).eq("host", host))
      .collect();
    const hit = row.find((r) => r.username === username) ?? null;
    return hit ? { ...hit, id: hit._id } : null;
  },
});

export const getById = query({
  args: { id: v.id("siteCredentials") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const row = owned(await ctx.db.get(id), userId);
    return row ? { ...row, id: row._id } : null;
  },
});

// First credential for a host (any username) — apply-assist account reuse.
export const byHost = query({
  args: { host: v.string() },
  handler: async (ctx, { host }) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db
      .query("siteCredentials")
      .withIndex("by_user_host", (q) => q.eq("userId", userId).eq("host", host))
      .first();
    return row ? { ...row, id: row._id } : null;
  },
});

// Insert-if-absent keyed on (host, username).
export const add = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => {
    const userId = await requireUser(ctx);
    const sameHost = await ctx.db
      .query("siteCredentials")
      .withIndex("by_user_host", (q) => q.eq("userId", userId).eq("host", doc.host))
      .collect();
    const existing = sameHost.find((r) => r.username === doc.username);
    if (existing) return { inserted: false as const, id: existing._id };
    const id = await ctx.db.insert("siteCredentials", { ...doc, userId });
    return { inserted: true as const, id };
  },
});

export const touch = mutation({
  args: { id: v.id("siteCredentials"), lastUsedAt: v.string() },
  handler: async (ctx, { id, lastUsedAt }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) return;
    await ctx.db.patch(id, { lastUsedAt });
  },
});

export const remove = mutation({
  args: { id: v.id("siteCredentials") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) return;
    await ctx.db.delete(id);
  },
});
