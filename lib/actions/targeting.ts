"use server";

import { revalidatePath } from "next/cache";
import { enrichOrganization } from "@/lib/integrations/apollo/enrich";
import { COMPANY_CATALOG } from "@/lib/integrations/ats/catalog";
import { api, convex } from "@/lib/convex/server";

// One Apollo credit per company, so the batch is bounded and the caller sees
// exactly what it spent. Companies already enriched are skipped by the query,
// making a re-run safe and free.
const BATCH = 40;

// Pull newly-curated catalog companies into the user's workspace, restricted
// to the industries they chose at onboarding so a sync never widens their
// scope behind their back. Also backfills headcount onto companies seeded
// before the catalog carried it.
export async function syncCatalogAction() {
  try {
    const onboarding = await convex().query(api.onboarding.status, {});
    const industries: string[] = onboarding?.prefs?.industries ?? [];
    const entries = COMPANY_CATALOG.filter(
      (c) => industries.length === 0 || industries.includes(c.industry),
    ).map((c) => ({
      name: c.name,
      domain: c.domain ?? null,
      roleTypes: (c.roleTypes ?? null) as string[] | null,
      atsType: c.atsType,
      atsSlug: c.atsSlug,
      headcount: c.headcount ?? null,
    }));
    const res = await convex().mutation(api.companies.seedCatalog, { entries });
    revalidatePath("/", "layout");
    return { ok: true as const, ...res, considered: entries.length };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Catalog sync failed",
    };
  }
}

// The ingestion ceiling — what the pull will and won't fetch from.
export async function setTargetSizeAction(max: number | null) {
  try {
    const { setTargetMaxHeadcount } = await import("@/lib/jobs/targeting");
    await setTargetMaxHeadcount(max);
    revalidatePath("/feed");
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not save targeting",
    };
  }
}

export async function backfillLevelsAction() {
  try {
    const res = await convex().mutation(api.targeting.backfillMyLevels, {});
    revalidatePath("/feed");
    return { ok: true as const, ...res };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Backfill failed",
    };
  }
}

export async function enrichCompanySizesAction(limit = BATCH) {
  let targets: { id: string; name: string; domain: string }[];
  try {
    targets = await convex().query(api.targeting.companiesNeedingSize, {
      limit: Math.min(limit, BATCH),
    });
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not list companies",
    };
  }
  if (targets.length === 0) {
    return { ok: true as const, enriched: 0, spent: 0, remaining: 0 };
  }

  let enriched = 0;
  let spent = 0;
  let lastError: string | null = null;
  for (const company of targets) {
    try {
      const { headcount, foundedYear } = await enrichOrganization(company.domain);
      spent++;
      await convex().mutation(api.targeting.setCompanySize, {
        id: company.id as never,
        headcount: headcount ?? undefined,
        foundedYear: foundedYear ?? undefined,
      });
      if (headcount !== null) enriched++;
    } catch (err) {
      // One bad domain shouldn't abort the batch — record it and continue so
      // the rest of the credits do useful work.
      lastError = err instanceof Error ? err.message : "enrichment failed";
    }
  }

  const remaining = (
    await convex().query(api.targeting.companiesNeedingSize, { limit: BATCH })
  ).length;
  revalidatePath("/feed");
  revalidatePath("/companies");
  return { ok: true as const, enriched, spent, remaining, error: lastError };
}
