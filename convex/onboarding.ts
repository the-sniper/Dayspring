import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { CATALOG_ENTRIES } from "./catalog";

const norm = (name: string) => name.trim().replace(/\s+/g, " ");

const DEFAULT_PROFILE =
  "REPLACE ME: paste your resume and preferences (role types, locations, visa needs, comp floor) in Settings.";

// Seed the curated ATS catalog + a placeholder profile for a brand-new account.
// Idempotent — safe if called twice (e.g. signup callback + client bootstrap).
export async function bootstrapNewUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<{ companiesAdded: number; profileCreated: boolean }> {
  const all = await ctx.db
    .query("companies")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  let companiesAdded = 0;
  if (all.length === 0) {
    const now = new Date().toISOString();
    for (const c of CATALOG_ENTRIES) {
      await ctx.db.insert("companies", {
        userId,
        name: c.name,
        domain: c.domain ?? undefined,
        roleTypes: c.roleTypes ?? undefined,
        visaSponsor: false,
        source: "catalog",
        atsType: c.atsType,
        atsSlug: c.atsSlug,
        createdAt: now,
      });
      companiesAdded++;
    }
  }

  let profileCreated = false;
  const profileRow = await ctx.db
    .query("settings")
    .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", "profile"))
    .unique();
  if (!profileRow) {
    await ctx.db.insert("settings", {
      userId,
      key: "profile",
      value: DEFAULT_PROFILE,
      updatedAt: new Date().toISOString(),
    });
    profileCreated = true;
  }

  return { companiesAdded, profileCreated };
}

// Case-insensitive company lookup scoped to one user (for cron pulls).
export async function companyByNameForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
) {
  const clean = norm(name).toLowerCase();
  const all = await ctx.db
    .query("companies")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return all.find((c) => norm(c.name).toLowerCase() === clean) ?? null;
}
