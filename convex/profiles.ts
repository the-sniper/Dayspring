import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { owned, requireUser } from "./lib";

async function userProfiles(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await userProfiles(ctx, userId);
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return rows.map((p) => ({ ...p, id: p._id }));
  },
});

export const getById = query({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    return owned(await ctx.db.get(id), userId);
  },
});

export const getDefault = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await userProfiles(ctx, userId);
    const def = rows.find((p) => p.isDefault) ?? rows[0] ?? null;
    return def ? { ...def, id: def._id } : null;
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return (await userProfiles(ctx, userId)).length;
  },
});

export const insert = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert("profiles", { ...doc, userId });
  },
});

export const patch = mutation({
  args: { id: v.id("profiles"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) throw new Error("Profile not found");
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) return;
    await ctx.db.delete(id);
  },
});

// Make exactly one profile the default (within the user's profiles).
export const setDefault = mutation({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) throw new Error("Profile not found");
    const rows = await userProfiles(ctx, userId);
    for (const p of rows) {
      if (p.isDefault && p._id !== id) await ctx.db.patch(p._id, { isDefault: false });
    }
    await ctx.db.patch(id, { isDefault: true });
  },
});
