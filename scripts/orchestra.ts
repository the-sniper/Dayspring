// Run the agent orchestra's daily cycle on demand: `npm run orchestra`.
// Idempotent per day — a second run the same day prints the existing report.
export {};

async function main() {
  const { prepareCli } = await import("../lib/env");
  await prepareCli();

  const { hasApiKey } = await import("../lib/claude/client");
  if (!(await hasApiKey())) {
    console.error("orchestra: no ANTHROPIC_API_KEY in Settings — aborting.");
    process.exit(1);
  }

  const { runOrchestra, BudgetExceededError } = await import(
    "../lib/orchestra/run"
  );

  console.log(`[${new Date().toISOString()}] orchestra run starting`);
  try {
    const result = await runOrchestra();
    if (!result.ran) console.log("(already ran today — existing report below)");
    console.log("\n" + result.reportBody + "\n");
    console.log(
      `tasks=${result.stats.tasksTotal} verified=${result.stats.verified} ` +
        `escalated=${result.stats.escalated} cost=$${result.stats.costUsd.toFixed(2)}`,
    );
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      console.error(`orchestra halted by Ledger: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }
  console.log(`[${new Date().toISOString()}] orchestra run done`);
}

main().catch((err) => {
  console.error(
    "orchestra run failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
