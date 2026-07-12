// Idempotent catalog seed: loads the curated cross-industry ATS board catalog
// (lib/integrations/ats/catalog.ts) into the `companies` table so `npm run
// pull-jobs` fetches from hundreds of startups / mid-size firms, not just the
// three demo companies. Safe to re-run: matches on name or (atsType, atsSlug),
// backfills ATS fields on companies that exist but aren't yet watched.
export {}; // module scope — dynamic-import-only files are otherwise global scripts

async function main() {
  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../lib/db");
  const { companies, jobs } = await import("../lib/db/schema");
  const { COMPANY_CATALOG } = await import("../lib/integrations/ats/catalog");

  const now = new Date().toISOString();
  let added = 0;
  let watched = 0; // existing rows we upgraded / corrected to catalog values
  let skipped = 0; // already present, already correct

  const cols = {
    id: companies.id,
    atsType: companies.atsType,
    atsSlug: companies.atsSlug,
    source: companies.source,
  };

  for (const c of COMPANY_CATALOG) {
    // Match by ATS locator first (stable), then by case-insensitive name so we
    // don't collide with the unique name index or duplicate demo-seed rows.
    const existing =
      db
        .select(cols)
        .from(companies)
        .where(and(eq(companies.atsType, c.atsType), eq(companies.atsSlug, c.atsSlug)))
        .get() ??
      db
        .select(cols)
        .from(companies)
        .where(sql`lower(${companies.name}) = ${c.name.toLowerCase()}`)
        .get();

    if (existing) {
      const notWatched = !existing.atsType || !existing.atsSlug;
      // Self-heal catalog/seed-managed rows whose token drifted (e.g. a token
      // fix in this file); never touch user-added ("manual") companies.
      const managed = existing.source === "catalog" || existing.source === "seed";
      const drifted = existing.atsType !== c.atsType || existing.atsSlug !== c.atsSlug;
      if (notWatched || (managed && drifted)) {
        db.update(companies)
          .set({ atsType: c.atsType, atsSlug: c.atsSlug, domain: c.domain ?? null, source: "catalog" })
          .where(eq(companies.id, existing.id))
          .run();
        watched++;
      } else {
        skipped++;
      }
      continue;
    }

    db.insert(companies)
      .values({
        name: c.name,
        domain: c.domain ?? null,
        roleTypes: c.roleTypes ?? null,
        source: "catalog",
        atsType: c.atsType,
        atsSlug: c.atsSlug,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
    added++;
  }

  // Prune stale catalog rows: companies previously seeded from the catalog that
  // are no longer in it (e.g. a token that turned out invalid and was removed),
  // but only when they carry zero jobs so we never orphan real data.
  const validKeys = new Set(COMPANY_CATALOG.map((c) => `${c.atsType}:${c.atsSlug.toLowerCase()}`));
  const catalogRows = db
    .select({ id: companies.id, atsType: companies.atsType, atsSlug: companies.atsSlug })
    .from(companies)
    .where(eq(companies.source, "catalog"))
    .all();
  let pruned = 0;
  for (const row of catalogRows) {
    const key = `${row.atsType}:${(row.atsSlug ?? "").toLowerCase()}`;
    if (validKeys.has(key)) continue;
    const jobCount = db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(eq(jobs.companyId, row.id))
      .get();
    if ((jobCount?.n ?? 0) > 0) continue; // keep — has real jobs attached
    db.delete(companies).where(eq(companies.id, row.id)).run();
    pruned++;
  }

  console.log(
    `seed:catalog — ${COMPANY_CATALOG.length} in catalog: ` +
      `${added} added, ${watched} upgraded to watched, ${skipped} already watched, ${pruned} stale pruned.`,
  );
}

main().catch((err) => {
  console.error("seed:catalog failed:", err);
  process.exit(1);
});
