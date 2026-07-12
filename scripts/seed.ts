// Idempotent seed: watched companies (one per ATS, small boards verified
// live 2026-07-05) + a placeholder profile setting. Safe to re-run any time.
export {}; // module scope — dynamic-import-only files are otherwise global scripts

async function main() {
  // Dynamic imports so loadLocalEnv runs before the Convex client reads its URL.
  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();
  const { api, convex } = await import("../lib/convex/server");
  const { getSetting, setSetting } = await import("../lib/settings/store");

  const now = new Date().toISOString();

  const seedCompanies = [
    {
      name: "Vercel",
      domain: "vercel.com",
      roleTypes: ["FE", "FS", "BE"],
      visaSponsor: false,
      source: "seed",
      atsType: "greenhouse",
      atsSlug: "vercel",
      createdAt: now,
    },
    {
      name: "Mistral",
      domain: "mistral.ai",
      roleTypes: ["BE", "DATA", "FS"],
      visaSponsor: false,
      source: "seed",
      atsType: "lever",
      atsSlug: "mistral",
      createdAt: now,
    },
    {
      name: "Linear",
      domain: "linear.app",
      roleTypes: ["FE", "FS", "BE"],
      visaSponsor: false,
      source: "seed",
      atsType: "ashby",
      atsSlug: "linear",
      createdAt: now,
    },
  ];

  let added = 0;
  for (const c of seedCompanies) {
    const existing = await convex().query(api.companies.getByName, { name: c.name });
    if (existing) continue;
    await convex().mutation(api.companies.create, { doc: c });
    added++;
  }

  let profileCreated = false;
  if (getSetting("profile") === null) {
    setSetting(
      "profile",
      "REPLACE ME: paste your resume and preferences (role types, locations, visa needs, comp floor) in Settings.",
    );
    profileCreated = true;
  }

  console.log(
    `seed: ${added}/${seedCompanies.length} companies added` +
      `${added < seedCompanies.length ? " (rest already present)" : ""}, ` +
      `profile setting ${profileCreated ? "created" : "already present"}`,
  );
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
