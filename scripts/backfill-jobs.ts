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
  const { db } = await import("../lib/db");
  const { jobs } = await import("../lib/db/schema");
  const { deriveJobMeta } = await import("../lib/jobs/derive");
  const { and, eq } = await import("drizzle-orm");

  const purge = process.argv.includes("--purge-non-us");

  const rows = db
    .select({
      id: jobs.id,
      title: jobs.title,
      location: jobs.location,
      description: jobs.description,
    })
    .from(jobs)
    .all();

  let updated = 0;
  let nonUs = 0;
  let purged = 0;

  for (const r of rows) {
    const meta = deriveJobMeta({
      title: r.title,
      location: r.location,
      description: r.description,
    });
    if (meta.isUs === false) nonUs++;

    // Only purge untouched feed rows (status `new`): no stage events,
    // applications, or outreach reference them, so deletes stay FK-safe.
    if (purge && meta.isUs === false) {
      const res = db
        .delete(jobs)
        .where(and(eq(jobs.id, r.id), eq(jobs.status, "new")))
        .run();
      if (res.changes > 0) {
        purged++;
        continue;
      }
    }

    db.update(jobs)
      .set({
        isUs: meta.isUs,
        workplaceType: meta.workplaceType,
        employmentType: meta.employmentType,
        salaryMin: meta.salaryMin,
        salaryMax: meta.salaryMax,
        salaryCurrency: meta.salaryCurrency,
      })
      .where(eq(jobs.id, r.id))
      .run();
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
