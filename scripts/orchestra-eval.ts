// Golden suite CLI (same core as the /company/team buttons).
//   npm run orchestra:eval -- --freeze   # snapshot today into the suite
//   npm run orchestra:eval               # run + record calibration
export {};
async function main() {
  const { prepareCli } = await import("../lib/env");
  await prepareCli();
  if (process.argv.includes("--freeze")) {
    const { freezeGoldenCase } = await import("../lib/orchestra/evalcore");
    console.log(await freezeGoldenCase());
    return;
  }
  const { runGoldenSuite } = await import("../lib/orchestra/evalcore");
  const r = await runGoldenSuite();
  for (const l of r.lines) console.log(l);
  if (r.total === 0) process.exit(1);
}
main().catch((err) => {
  console.error("eval failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
