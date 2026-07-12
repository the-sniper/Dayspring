import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { owned, requireUser } from "./lib";

async function userContacts(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("contacts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

async function userCompanyNames(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const companies = await ctx.db
    .query("companies")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Map(companies.map((c) => [String(c._id), c.name]));
}

export const getById = query({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    return owned(await ctx.db.get(id), userId);
  },
});

export const byCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(companyId), userId)) return [];
    const rows = await ctx.db
      .query("contacts")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return rows.map((c) => ({ ...c, id: c._id }));
  },
});

export const byApolloIds = query({
  args: { apolloIds: v.array(v.string()) },
  handler: async (ctx, { apolloIds }) => {
    const userId = await requireUser(ctx);
    const set = new Set(apolloIds);
    const rows = await userContacts(ctx, userId);
    return rows.filter((c) => c.apolloId && set.has(c.apolloId)).map((c) => c.apolloId);
  },
});

export const byHappenstanceIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }) => {
    const userId = await requireUser(ctx);
    const set = new Set(ids);
    const rows = await userContacts(ctx, userId);
    return rows.filter((c) => c.happenstanceId && set.has(c.happenstanceId)).map((c) => c.happenstanceId);
  },
});

// Dedupe-aware insert keyed on apolloId / happenstanceId when present.
export const save = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => {
    const userId = await requireUser(ctx);
    if (doc.apolloId) {
      const existing = await ctx.db
        .query("contacts")
        .withIndex("by_user_apollo", (q) => q.eq("userId", userId).eq("apolloId", doc.apolloId))
        .unique();
      if (existing) return { inserted: false as const, id: existing._id };
    }
    if (doc.happenstanceId) {
      const existing = await ctx.db
        .query("contacts")
        .withIndex("by_user_happenstance", (q) =>
          q.eq("userId", userId).eq("happenstanceId", doc.happenstanceId),
        )
        .unique();
      if (existing) return { inserted: false as const, id: existing._id };
    }
    const id = await ctx.db.insert("contacts", { ...doc, userId });
    return { inserted: true as const, id };
  },
});

export const patch = mutation({
  args: { id: v.id("contacts"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) throw new Error("Contact not found");
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) return;
    await ctx.db.delete(id);
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return (await userContacts(ctx, userId)).length;
  },
});

// All contacts with company name attached — the warm-network search/browse
// runs its stopword/singularize token logic over this in Node.
export const allEnriched = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const contacts = await userContacts(ctx, userId);
    const nameById = await userCompanyNames(ctx, userId);
    return contacts.map((c) => ({
      ...c,
      id: c._id,
      companyName: c.companyId ? nameById.get(String(c.companyId)) ?? null : null,
    }));
  },
});

// Local contact search: multi-token AND across name/title/company/notes fields.
export const list = query({
  args: { q: v.string(), page: v.number(), pageSize: v.number() },
  handler: async (ctx, { q, page, pageSize }) => {
    const userId = await requireUser(ctx);
    const contacts = await userContacts(ctx, userId);
    const nameById = await userCompanyNames(ctx, userId);
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = contacts
      .map((c) => ({ ...c, id: c._id, companyName: c.companyId ? nameById.get(String(c.companyId)) ?? null : null }))
      .filter((c) => {
        if (tokens.length === 0) return true;
        const hay = [c.name, c.title, c.companyName, c.notes, c.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return { rows: rows.slice(start, start + pageSize), total };
  },
});
