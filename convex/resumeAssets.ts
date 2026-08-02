import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib";

// The LaTeX tailoring path's two inputs: the .tex template (typography) and the
// Master Knowledge Base (content). One row per kind per user, edited in
// Settings. Kept out of masterResumes on purpose — neither of these is a resume
// you'd ever attach to an application, and both would otherwise pollute the
// master list and the apply-assist PDF resolution.

export const get = query({
  args: { kind: v.string() },
  handler: async (ctx, { kind }) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db
      .query("resumeAssets")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
      .unique();
    if (!row) return null;
    return {
      id: row._id,
      kind: row.kind,
      label: row.label ?? null,
      content: row.content,
      updatedAt: row.updatedAt,
    };
  },
});

// Presence and size without shipping the whole document to the client — the
// knowledge base can be very large, and Settings only needs to say whether it
// is there and when it changed.
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("resumeAssets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => ({
      id: r._id,
      kind: r.kind,
      label: r.label ?? null,
      chars: r.content.length,
      updatedAt: r.updatedAt,
    }));
  },
});

export const upsert = mutation({
  args: { kind: v.string(), content: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, { kind, content, label }) => {
    const userId = await requireUser(ctx);
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("resumeAssets")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { content, label, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("resumeAssets", {
      userId,
      kind,
      label,
      content,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { kind: v.string() },
  handler: async (ctx, { kind }) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("resumeAssets")
      .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
