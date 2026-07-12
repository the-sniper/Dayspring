// Backfill the derived job metadata columns (is_us, workplace_type,
// employment_type, salary_*) for rows that predate them, and optionally purge
// confirmed non-US roles still sitting in the feed.
//
//   npm run backfill                 # populate columns only (non-destructive)
//   npm run backfill -- --purge-non-us   # also delete non-US `new` feed rows
export {};

async function main() {
  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();
  const { api, convex } = await import("../lib/convex/server");
  const { cleanDoc } = await import("../lib/convex/server");
  const { deriveJobMeta } = await import("../lib/jobs/derive");

  const purge = process.argv.includes("--purge-non-us");

  const rows = await convex().query(api.jobs.listAllWithCompany, {});

  let updated = 0;
  let nonUs = 0;
  let purged = 0;

  for (const r of rows) {
    // JD text lives in a side table now — fetch it per job for the derivation.
    const description = await convex().query(api.jobs.getDescription, { id: r.id });
    const meta = deriveJobMeta({
      title: r.title,
      location: r.location ?? null,
      description,
    });
    if (meta.isUs === false) nonUs++;

    // Only purge untouched feed rows (status `new`): no stage events,
    // applications, or outreach reference them, so deletes stay FK-safe.
    if (purge && meta.isUs === false && r.status === "new") {
      await convex().mutation(api.jobs.deleteCascade, { id: r.id });
      purged++;
      continue;
    }

    await convex().mutation(api.jobs.patch, {
      id: r.id,
      patch: cleanDoc({
        isUs: meta.isUs,
        workplaceType: meta.workplaceType,
        employmentType: meta.employmentType,
        salaryMin: meta.salaryMin,
        salaryMax: meta.salaryMax,
        salaryCurrency: meta.salaryCurrency,
      }),
    });
    updated++;
  }

  console.log(
    `backfilled ${updated} jobs · ${nonUs} non-US detected` +
      (purge ? ` · ${purged} non-US 'new' rows purged` : ""),
  );
  if (!purge && nonUs > 0) {
    console.log(
      `run "npm run backfill -- --purge-non-us" to delete the ${nonUs} non-US feed rows`,
    );
  }
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
