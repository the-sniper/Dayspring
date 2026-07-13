import catalog from "../shared/company-catalog.json";

export type CatalogEntry = {
  name: string;
  domain: string | null;
  roleTypes: string[] | null;
  atsType: string;
  atsSlug: string;
  industry: string;
};

// Curated ATS board catalog — shared with lib/integrations/ats/catalog.ts via
// shared/company-catalog.json so new-user onboarding and the seed script stay
// in sync.
export const CATALOG_ENTRIES = catalog as CatalogEntry[];
