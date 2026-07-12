// Idempotent catalog seed: loads the curated cross-industry ATS board catalog
// (lib/integrations/ats/catalog.ts) into the `companies` table so `npm run
// pull-jobs` fetches from hundreds of startups / mid-size firms, not just the
// three demo companies. Safe to re-run: matches on name or (atsType, atsSlug),
// backfills ATS fields on companies that exist but aren't yet watched. The
// match/self-heal/prune all happen server-side in api.companies.seedCatalog.
export {}; // module scope — dynamic-import-only files are otherwise global scripts

async function main() {
  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();
  const { api, convex } = await import("../lib/convex/server");
  const { COMPANY_CATALOG } = await import("../lib/integrations/ats/catalog");

  const entries = COMPANY_CATALOG.map((c) => ({
    name: c.name,
    domain: c.domain ?? null,
    roleTypes: c.roleTypes ?? null,
    atsType: c.atsType,
    atsSlug: c.atsSlug,
  }));

  const { added, watched, skipped, pruned } = await convex().mutation(
    api.companies.seedCatalog,
    { entries },
  );

  console.log(
    `seed:catalog — ${COMPANY_CATALOG.length} in catalog: ` +
      `${added} added, ${watched} upgraded to watched, ${skipped} already watched, ${pruned} stale pruned.`,
  );
}

main().catch((err) => {
  console.error("seed:catalog failed:", err);
  process.exit(1);
});
