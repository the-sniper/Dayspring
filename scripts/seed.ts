// Idempotent seed: watched companies (one per ATS, small boards verified
// live 2026-07-05) + a placeholder profile row. Safe to re-run any time.
export {}; // module scope — dynamic-import-only files are otherwise global scripts

async function main() {
  // Dynamic imports so loadLocalEnv runs before lib/db reads DAYSPRING_DB_PATH.
  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();
  const { db } = await import("../lib/db");
  const { companies, settings } = await import("../lib/db/schema");

  const now = new Date().toISOString();

  const seedCompanies: (typeof companies.$inferInsert)[] = [
    {
      name: "Vercel",
      domain: "vercel.com",
      roleTypes: ["FE", "FS", "BE"],
      source: "seed",
      atsType: "greenhouse",
      atsSlug: "vercel",
      createdAt: now,
    },
    {
      name: "Mistral",
      domain: "mistral.ai",
      roleTypes: ["BE", "DATA", "FS"],
      source: "seed",
      atsType: "lever",
      atsSlug: "mistral",
      createdAt: now,
    },
    {
      name: "Linear",
      domain: "linear.app",
      roleTypes: ["FE", "FS", "BE"],
      source: "seed",
      atsType: "ashby",
      atsSlug: "linear",
      createdAt: now,
    },
  ];

  let added = 0;
  for (const c of seedCompanies) {
    const res = db.insert(companies).values(c).onConflictDoNothing().run();
    added += res.changes;
  }

  const profileRes = db
    .insert(settings)
    .values({
      key: "profile",
      value:
        "REPLACE ME: paste your resume and preferences (role types, locations, visa needs, comp floor) in Settings.",
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();

  console.log(
    `seed: ${added}/${seedCompanies.length} companies added` +
      `${added < seedCompanies.length ? " (rest already present)" : ""}, ` +
      `profile row ${profileRes.changes ? "created" : "already present"}`,
  );
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
