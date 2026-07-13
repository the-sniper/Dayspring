// Curated cross-industry catalog of company ATS boards to watch. Source of truth
// is shared/company-catalog.json (also consumed by convex/onboarding on signup).
import catalog from "../../../shared/company-catalog.json";
import type { AtsType, RoleType } from "@/lib/types";

export type CatalogCompany = {
  name: string;
  domain?: string;
  atsType: Exclude<AtsType, "workday">;
  atsSlug: string;
  industry: string;
  roleTypes?: RoleType[];
};

type RawEntry = {
  name: string;
  domain: string | null;
  roleTypes: string[] | null;
  atsType: string;
  atsSlug: string;
  industry: string;
};

const RAW = catalog as RawEntry[];

// Flat, deduped-by-(atsType, atsSlug) catalog consumed by the seed script.
export const COMPANY_CATALOG: CatalogCompany[] = (() => {
  const seen = new Set<string>();
  const flat: CatalogCompany[] = [];
  for (const c of RAW) {
    const key = `${c.atsType}:${c.atsSlug.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flat.push({
      name: c.name,
      domain: c.domain ?? undefined,
      atsType: c.atsType as Exclude<AtsType, "workday">,
      atsSlug: c.atsSlug,
      industry: c.industry,
      roleTypes: (c.roleTypes ?? undefined) as RoleType[] | undefined,
    });
  }
  return flat;
})();

export const CATALOG_INDUSTRIES = [...new Set(RAW.map((c) => c.industry))].sort();
