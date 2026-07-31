import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { ROLE_TYPES, ROLE_TYPE_LABELS, type RoleType } from "../shared/role-types";
import { CATALOG_ENTRIES } from "./catalog";
import { requireUser } from "./lib";

const norm = (name: string) => name.trim().replace(/\s+/g, " ");

// Answers collected by the /onboarding screen, stored as JSON in the settings
// table under this key. Its presence is the "user finished onboarding" marker
// — the client gate redirects to /onboarding until it exists.
const PREFS_KEY = "onboarding";

export type OnboardingPrefs = {
  domain: string;
  industries: string[];
  roleTypes: string[];
  completedAt: string;
};

// Shared reader so other modules (e.g. the feed's "best" sort) can
// personalize against the onboarding answers.
export async function getOnboardingPrefs(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<OnboardingPrefs | null> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_user_key", (q) =>
      q.eq("userId", userId).eq("key", PREFS_KEY),
    )
    .unique();
  if (!row) return null;
  try {
    return JSON.parse(row.value) as OnboardingPrefs;
  } catch {
    return null;
  }
}

// Whether the signed-in user has been through onboarding. Null when signed
// out (the gate skips the query in that case anyway).
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const prefs = await getOnboardingPrefs(ctx, userId);
    return { completed: prefs !== null, prefs };
  },
});

// Choices the onboarding screen renders — industries come from the curated
// catalog so the list always matches what we can actually seed.
export const options = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const counts = new Map<string, number>();
    for (const c of CATALOG_ENTRIES) {
      counts.set(c.industry, (counts.get(c.industry) ?? 0) + 1);
    }
    return {
      industries: [...counts.entries()].map(([name, companyCount]) => ({
        name,
        companyCount,
      })),
    };
  },
});

// Finish onboarding: persist the answers, seed the catalog companies in the
// chosen industries (skipping any the user already tracks), write a starter
// scoring profile if none exists, and kick off a background job pull.
// Idempotent — re-running updates prefs and only adds what's missing.
export const complete = mutation({
  args: {
    domain: v.string(),
    industries: v.array(v.string()),
    roleTypes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    const domain = norm(args.domain).slice(0, 200);
    const validIndustries = new Set(CATALOG_ENTRIES.map((c) => c.industry));
    const industries = [...new Set(args.industries)].filter((i) =>
      validIndustries.has(i),
    );
    const roleTypes = [...new Set(args.roleTypes)].filter((r) =>
      (ROLE_TYPES as readonly string[]).includes(r),
    );
    if (industries.length === 0) {
      throw new Error("Pick at least one industry.");
    }

    const now = new Date().toISOString();
    const prefs: OnboardingPrefs = {
      domain,
      industries,
      roleTypes,
      completedAt: now,
    };
    const prefsRow = await ctx.db
      .query("settings")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", userId).eq("key", PREFS_KEY),
      )
      .unique();
    if (prefsRow) {
      await ctx.db.patch(prefsRow._id, {
        value: JSON.stringify(prefs),
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("settings", {
        userId,
        key: PREFS_KEY,
        value: JSON.stringify(prefs),
        updatedAt: now,
      });
    }

    // Seed the chosen industries. Existing accounts keep whatever they
    // already track — we only add, never delete.
    const existing = await ctx.db
      .query("companies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const trackedNames = new Set(
      existing.map((c) => norm(c.name).toLowerCase()),
    );
    let companiesAdded = 0;
    for (const c of CATALOG_ENTRIES) {
      if (!industries.includes(c.industry)) continue;
      if (trackedNames.has(norm(c.name).toLowerCase())) continue;
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
      companiesAdded++;
    }

    // Starter profile so match scoring has signal from day one. Never
    // overwrite a profile the user actually wrote.
    const profileRow = await ctx.db
      .query("settings")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", userId).eq("key", "profile"),
      )
      .unique();
    const placeholder =
      !profileRow || profileRow.value.trim().startsWith("REPLACE ME");
    if (placeholder) {
      const starter = [
        domain && `Domain of work: ${domain}.`,
        roleTypes.length > 0 &&
          `Interested in ${roleTypes
            .map((r) => ROLE_TYPE_LABELS[r as RoleType] ?? r)
            .join(", ")} roles.`,
        `Preferred industries: ${industries.join(", ")}.`,
        "",
        "(Generated from onboarding — paste your resume in Settings for sharper match scores.)",
      ]
        .filter((l) => l !== false)
        .join("\n");
      if (profileRow) {
        await ctx.db.patch(profileRow._id, { value: starter, updatedAt: now });
      } else {
        await ctx.db.insert("settings", {
          userId,
          key: "profile",
          value: starter,
          updatedAt: now,
        });
      }
    }

    const anyJob = await ctx.db
      .query("jobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1);
    const pullScheduled = companiesAdded > 0 || anyJob.length === 0;
    if (pullScheduled) {
      await ctx.scheduler.runAfter(0, internal.pull.pullForUser, { userId });
    }
    return { companiesAdded, pullScheduled };
  },
});

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
