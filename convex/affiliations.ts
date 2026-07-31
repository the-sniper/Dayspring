import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { owned, requireUser } from "./lib";

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(contactId), userId)) return [];
    const rows = await ctx.db
      .query("affiliations")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .take(50);
    return rows
      .map((a) => ({ ...a, id: a._id }))
      .sort((a, b) => b.strength - a.strength);
  },
});

// All of the signed-in user's affiliations — metrics segmentation joins these
// against outreach rows by contactId.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("affiliations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(2000);
    return rows.map((a) => ({ ...a, id: a._id }));
  },
});

export const insert = mutation({
  args: {
    contactId: v.id("contacts"),
    kind: v.string(),
    detail: v.string(),
    strength: v.number(),
    evidenceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(args.contactId), userId)) {
      throw new Error("Contact not found");
    }
    return await ctx.db.insert("affiliations", {
      ...args,
      strength: Math.min(3, Math.max(1, Math.round(args.strength))),
      userId,
      createdAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("affiliations") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) return;
    await ctx.db.delete(id);
  },
});
