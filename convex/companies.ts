import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const norm = (name: string) => name.trim().replace(/\s+/g, " ");

// Case-insensitive lookup by name (mirrors the old `lower(name) = ?`).
async function byName(ctx: any, name: string) {
  const clean = norm(name).toLowerCase();
  // by_name index is case-sensitive; scan the small companies table and match
  // case-insensitively to preserve prior semantics.
  const all = await ctx.db.query("companies").collect();
  return all.find((c: any) => c.name.trim().replace(/\s+/g, " ").toLowerCase() === clean) ?? null;
}

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => byName(ctx, name),
});

export const getById = query({
  args: { id: v.id("companies") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const findOrCreate = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const existing = await byName(ctx, name);
    if (existing) return existing._id;
    return await ctx.db.insert("companies", {
      name: norm(name),
      visaSponsor: false,
      createdAt: new Date().toISOString(),
    });
  },
});

export const create = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => await ctx.db.insert("companies", doc),
});

export const update = mutation({
  args: { id: v.id("companies"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, patch);
  },
});

// Cascade delete: contacts referencing the company are removed, then the row.
export const removeCascade = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, { id }) => {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_company", (q) => q.eq("companyId", id))
      .collect();
    for (const c of contacts) await ctx.db.delete(c._id);
    await ctx.db.delete(id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("companies").collect();
    return rows.map((c) => ({ id: c._id, name: c.name }));
  },
});

// Full company rows (id + all fields) — used by the pull core to find watched
// ATS boards and by the board page's company picker.
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("companies").collect();
    return rows.map((c) => ({ ...c, id: c._id }));
  },
});

// Idempotent catalog load + self-heal + prune, done server-side in one call
// (mirrors the old scripts/seed-catalog.ts SQLite logic). `entries` is the
// curated COMPANY_CATALOG; returns a small tally for the CLI to print.
export const seedCatalog = mutation({
  args: {
    entries: v.array(
      v.object({
        name: v.string(),
        domain: v.optional(v.union(v.string(), v.null())),
        roleTypes: v.optional(v.union(v.array(v.string()), v.null())),
        atsType: v.string(),
        atsSlug: v.string(),
      }),
    ),
  },
  handler: async (ctx, { entries }) => {
    const all = await ctx.db.query("companies").collect();
    const byLocator = new Map<string, (typeof all)[number]>();
    const byName = new Map<string, (typeof all)[number]>();
    for (const c of all) {
      if (c.atsType && c.atsSlug) byLocator.set(`${c.atsType}:${c.atsSlug}`, c);
      byName.set(c.name.trim().replace(/\s+/g, " ").toLowerCase(), c);
    }

    const now = new Date().toISOString();
    let added = 0;
    let watched = 0;
    let skipped = 0;

    for (const c of entries) {
      const existing =
        byLocator.get(`${c.atsType}:${c.atsSlug}`) ??
        byName.get(c.name.trim().replace(/\s+/g, " ").toLowerCase());

      if (existing) {
        const notWatched = !existing.atsType || !existing.atsSlug;
        const managed = existing.source === "catalog" || existing.source === "seed";
        const drifted = existing.atsType !== c.atsType || existing.atsSlug !== c.atsSlug;
        if (notWatched || (managed && drifted)) {
          await ctx.db.patch(existing._id, {
            atsType: c.atsType,
            atsSlug: c.atsSlug,
            domain: c.domain ?? undefined,
            source: "catalog",
          });
          watched++;
        } else {
          skipped++;
        }
        continue;
      }

      await ctx.db.insert("companies", {
        name: c.name,
        domain: c.domain ?? undefined,
        roleTypes: c.roleTypes ?? undefined,
        visaSponsor: false,
        source: "catalog",
        atsType: c.atsType,
        atsSlug: c.atsSlug,
        createdAt: now,
      });
      added++;
    }

    // Prune stale catalog rows with zero jobs attached.
    const validKeys = new Set(entries.map((c) => `${c.atsType}:${c.atsSlug.toLowerCase()}`));
    let pruned = 0;
    for (const row of all) {
      if (row.source !== "catalog") continue;
      const key = `${row.atsType}:${(row.atsSlug ?? "").toLowerCase()}`;
      if (validKeys.has(key)) continue;
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_company", (q) => q.eq("companyId", row._id))
        .collect();
      if (jobs.length > 0) continue;
      await ctx.db.delete(row._id);
      pruned++;
    }

    return { added, watched, skipped, pruned };
  },
});

export const jobCount = query({
  args: { id: v.id("companies") },
  handler: async (ctx, { id }) => {
    const rows = await ctx.db
      .query("jobs")
      .withIndex("by_company", (q) => q.eq("companyId", id))
      .collect();
    return rows.length;
  },
});

// Companies list page: each company with its total job count.
export const withJobCounts = query({
  args: {},
  handler: async (ctx) => {
    const companies = await ctx.db.query("companies").collect();
    const out = [];
    for (const c of companies) {
      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_company", (q) => q.eq("companyId", c._id))
        .collect();
      out.push({ ...c, id: c._id, jobCount: jobs.length });
    }
    return out;
  },
});
