// Weekly retro on demand: `npm run retro` (daily.ts also runs it on Sundays).
export {};
async function main() {
  const { prepareCli } = await import("../lib/env");
  await prepareCli();
  const { runRetro } = await import("../lib/orchestra/retro");
  const r = await runRetro();
  console.log(r.message);
}
main().catch((err) => {
  console.error("retro failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
