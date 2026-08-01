import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { owned, requireUser } from "./lib";

const norm = (name: string) => name.trim().replace(/\s+/g, " ");

async function userCompanies(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("companies")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

// Case-insensitive lookup by name (mirrors the old `lower(name) = ?`).
async function byName(ctx: QueryCtx | MutationCtx, userId: Id<"users">, name: string) {
  const clean = norm(name).toLowerCase();
  // The name index is case-sensitive; scan the user's (small) companies set
  // and match case-insensitively to preserve prior semantics.
  const all = await userCompanies(ctx, userId);
  return all.find((c) => c.name.trim().replace(/\s+/g, " ").toLowerCase() === clean) ?? null;
}

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);
    return byName(ctx, userId, name);
  },
});

export const getById = query({
  args: { id: v.id("companies") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    return owned(await ctx.db.get(id), userId);
  },
});

export const findOrCreate = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);
    const existing = await byName(ctx, userId, name);
    if (existing) return existing._id;
    return await ctx.db.insert("companies", {
      userId,
      name: norm(name),
      visaSponsor: false,
      createdAt: new Date().toISOString(),
    });
  },
});

export const create = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert("companies", { ...doc, userId });
  },
});

export const update = mutation({
  args: { id: v.id("companies"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) throw new Error("Company not found");
    // `null` means unset optional fields (JSON can't carry undefined).
    const next: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
    for (const [k, val] of Object.entries(next)) {
      if (val === null) next[k] = undefined;
    }
    await ctx.db.patch(id, next);
  },
});

// Cascade delete: contacts referencing the company are removed, then the row.
export const removeCascade = mutation({
  args: { id: v.id("companies") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) return;
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
    const userId = await requireUser(ctx);
    const rows = await userCompanies(ctx, userId);
    return rows.map((c) => ({ id: c._id, name: c.name }));
  },
});

// Full company rows (id + all fields) — used by the pull core to find watched
// ATS boards and by the board page's company picker.
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await userCompanies(ctx, userId);
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
        headcount: v.optional(v.union(v.number(), v.null())),
      }),
    ),
  },
  handler: async (ctx, { entries }) => {
    const userId = await requireUser(ctx);
    const all = await userCompanies(ctx, userId);
    const byLocator = new Map<string, (typeof all)[number]>();
    const byNameMap = new Map<string, (typeof all)[number]>();
    for (const c of all) {
      if (c.atsType && c.atsSlug) byLocator.set(`${c.atsType}:${c.atsSlug}`, c);
      byNameMap.set(c.name.trim().replace(/\s+/g, " ").toLowerCase(), c);
    }

    const now = new Date().toISOString();
    let added = 0;
    let watched = 0;
    let skipped = 0;

    for (const c of entries) {
      const existing =
        byLocator.get(`${c.atsType}:${c.atsSlug}`) ??
        byNameMap.get(c.name.trim().replace(/\s+/g, " ").toLowerCase());

      if (existing) {
        const notWatched = !existing.atsType || !existing.atsSlug;
        const managed = existing.source === "catalog" || existing.source === "seed";
        const drifted = existing.atsType !== c.atsType || existing.atsSlug !== c.atsSlug;
        // Backfill catalog headcount onto rows seeded before the field
        // existed — free size data that costs no Apollo credits.
        const needsSize = existing.headcount === undefined && typeof c.headcount === "number";
        if (notWatched || (managed && drifted) || needsSize) {
          const patch: Record<string, unknown> = {};
          if (notWatched || (managed && drifted)) {
            patch.atsType = c.atsType;
            patch.atsSlug = c.atsSlug;
            patch.domain = c.domain ?? undefined;
            patch.source = "catalog";
          }
          if (needsSize) patch.headcount = c.headcount as number;
          await ctx.db.patch(existing._id, patch);
          watched++;
        } else {
          skipped++;
        }
        continue;
      }

      await ctx.db.insert("companies", {
        userId,
        name: c.name,
        domain: c.domain ?? undefined,
        roleTypes: c.roleTypes ?? undefined,
        visaSponsor: false,
        source: "catalog",
        atsType: c.atsType,
        atsSlug: c.atsSlug,
        headcount: c.headcount ?? undefined,
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
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) return 0;
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
    const userId = await requireUser(ctx);
    const companies = await userCompanies(ctx, userId);
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
