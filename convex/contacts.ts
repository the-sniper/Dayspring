import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getById = query({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const byCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
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
    const set = new Set(apolloIds);
    const rows = await ctx.db.query("contacts").collect();
    return rows.filter((c) => c.apolloId && set.has(c.apolloId)).map((c) => c.apolloId);
  },
});

export const byHappenstanceIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }) => {
    const set = new Set(ids);
    const rows = await ctx.db.query("contacts").collect();
    return rows.filter((c) => c.happenstanceId && set.has(c.happenstanceId)).map((c) => c.happenstanceId);
  },
});

// Dedupe-aware insert keyed on apolloId / happenstanceId when present.
export const save = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => {
    if (doc.apolloId) {
      const existing = await ctx.db
        .query("contacts")
        .withIndex("by_apollo_id", (q) => q.eq("apolloId", doc.apolloId))
        .unique();
      if (existing) return { inserted: false as const, id: existing._id };
    }
    if (doc.happenstanceId) {
      const existing = await ctx.db
        .query("contacts")
        .withIndex("by_happenstance_id", (q) => q.eq("happenstanceId", doc.happenstanceId))
        .unique();
      if (existing) return { inserted: false as const, id: existing._id };
    }
    const id = await ctx.db.insert("contacts", doc);
    return { inserted: true as const, id };
  },
});

export const patch = mutation({
  args: { id: v.id("contacts"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("contacts").collect()).length,
});

// All contacts with company name attached — the warm-network search/browse
// runs its stopword/singularize token logic over this in Node.
export const allEnriched = query({
  args: {},
  handler: async (ctx) => {
    const contacts = await ctx.db.query("contacts").collect();
    const companies = await ctx.db.query("companies").collect();
    const nameById = new Map(companies.map((c) => [String(c._id), c.name]));
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
    const contacts = await ctx.db.query("contacts").collect();
    const companies = await ctx.db.query("companies").collect();
    const nameById = new Map(companies.map((c) => [String(c._id), c.name]));
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
