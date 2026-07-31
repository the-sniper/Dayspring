import catalog from "../shared/company-catalog.json";

export type CatalogEntry = {
  name: string;
  domain: string | null;
  roleTypes: string[] | null;
  atsType: string;
  atsSlug: string;
  industry: string;
  // Apollo-sourced headcount, baked in at curation time so seeded companies
  // have a size band without spending an enrichment credit per user.
  headcount?: number;
};

// Curated ATS board catalog — shared with lib/integrations/ats/catalog.ts via
// shared/company-catalog.json so new-user onboarding and the seed script stay
// in sync.
export const CATALOG_ENTRIES = catalog as CatalogEntry[];
