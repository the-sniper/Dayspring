import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("profiles").collect();
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return rows.map((p) => ({ ...p, id: p._id }));
  },
});

export const getById = query({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const getDefault = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("profiles").collect();
    const def = rows.find((p) => p.isDefault) ?? rows[0] ?? null;
    return def ? { ...def, id: def._id } : null;
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("profiles").collect()).length,
});

export const insert = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => await ctx.db.insert("profiles", doc),
});

export const patch = mutation({
  args: { id: v.id("profiles"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// Make exactly one profile the default.
export const setDefault = mutation({
  args: { id: v.id("profiles") },
  handler: async (ctx, { id }) => {
    const rows = await ctx.db.query("profiles").collect();
    for (const p of rows) {
      if (p.isDefault && p._id !== id) await ctx.db.patch(p._id, { isDefault: false });
    }
    await ctx.db.patch(id, { isDefault: true });
  },
});
