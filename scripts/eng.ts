// Forge: turn the oldest queued eng request into a spec. `npm run eng`
export {};
async function main() {
  const { prepareCli } = await import("../lib/env");
  await prepareCli();
  const { runForgeSpec } = await import("../lib/orchestra/eng");
  const r = await runForgeSpec();
  console.log(r.message);
  if (!r.done) process.exit(1);
}
main().catch((err) => {
  console.error("eng failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
