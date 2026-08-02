// Probe: layer 0 gates + adversarial diff-vs-spec review. `npm run eng:review`
export {};
async function main() {
  const { prepareCli } = await import("../lib/env");
  await prepareCli();
  const { runProbeReview } = await import("../lib/orchestra/eng");
  const r = await runProbeReview();
  console.log(r.message);
  if (!r.done) process.exit(1);
}
main().catch((err) => {
  console.error("eng:review failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
