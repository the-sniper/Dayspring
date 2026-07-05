// CLI entry for the pull core — the future daily-cron hook.
// Usage: npm run pull-jobs
export {}; // module scope — dynamic-import-only files are otherwise global scripts

async function main() {
  // Dynamic imports so loadLocalEnv runs before lib/db reads DAYSPRING_DB_PATH.
  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();
  const { pullAllJobs } = await import("../lib/jobs/pull");

  const res = await pullAllJobs();
  for (const c of res.perCompany) {
    console.log(`${c.name.padEnd(20)} fetched ${String(c.fetched).padStart(4)}  added ${String(c.added).padStart(4)}`);
  }
  for (const e of res.errors) {
    console.error(`${e.name.padEnd(20)} ERROR ${e.message}`);
  }
  const total = res.perCompany.reduce((n, c) => n + c.added, 0);
  console.log(`total added: ${total}`);

  // Exit non-zero only when every watched company failed.
  if (res.perCompany.length === 0 && res.errors.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("pull failed:", err);
  process.exit(1);
});
