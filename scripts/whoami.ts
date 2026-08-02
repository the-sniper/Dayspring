// Which Convex account do the CLI scripts attach to, and which one has your
// data?
//
// One email can own several user documents — an OAuth sign-in and an unverified
// password signup don't link, so a single stray signup leaves a duplicate behind
// permanently. Attaching to the wrong one is silent: scripts authenticate fine
// and report "0 rows" as though there were nothing to do.
//
//   npx tsx scripts/whoami.ts
export {};

async function main() {
  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();

  const email = process.env.DAYSPRING_CLI_EMAIL?.trim();
  const secret = process.env.DAYSPRING_CLI_SECRET?.trim();
  const pinned = process.env.DAYSPRING_CLI_USER_ID?.trim();
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
  if (!email || !secret) {
    throw new Error(
      "Set DAYSPRING_CLI_EMAIL and DAYSPRING_CLI_SECRET in .env.local first (and the same " +
        'secret on the deployment: `npx convex env set DAYSPRING_CLI_SECRET "<value>"`).',
    );
  }

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../convex/_generated/api");
  const rows = await new ConvexHttpClient(url).query(api.users.candidates, { email, secret });

  if (rows === null) {
    console.log(
      "\n  ✗ The deployment rejected the secret.\n" +
        "    Check `npx convex env get DAYSPRING_CLI_SECRET` matches .env.local exactly.\n",
    );
    process.exit(1);
  }
  if (rows.length === 0) {
    console.log(`\n  ✗ No account found for ${email}. Check the address in .env.local.\n`);
    process.exit(1);
  }

  console.log(`\n  Accounts for ${email}:\n`);
  const withData = rows.filter((r) => Object.keys(r.counts).length > 0);
  for (const r of rows) {
    const counts = Object.entries(r.counts)
      .map(([t, n]) => `${n}${n >= 200 ? "+" : ""} ${t}`)
      .join(", ");
    const mark = pinned === r.id ? "→" : " ";
    console.log(`  ${mark} ${r.id}  ${counts || "(empty)"}`);
  }

  console.log("");
  if (pinned) {
    const hit = rows.find((r) => r.id === pinned);
    if (!hit) {
      console.log(`  ✗ DAYSPRING_CLI_USER_ID is ${pinned}, which isn't one of these accounts.\n`);
      process.exit(1);
    }
    if (Object.keys(hit.counts).length === 0) {
      // The exact failure that produced "0 of 0 untriaged posts".
      console.log(
        `  ✗ You're pinned to the EMPTY account. That's why scripts report zero rows.\n` +
          (withData.length
            ? `    Change .env.local to:\n      DAYSPRING_CLI_USER_ID=${withData[0].id}\n`
            : `    None of these accounts has data — is this the right email?\n`),
      );
      process.exit(1);
    }
    console.log(`  ✓ Pinned to the account holding your data.\n`);
    return;
  }

  if (rows.length === 1) {
    console.log("  ✓ One account, nothing to pin.\n");
    return;
  }
  console.log(
    `  ${rows.length} accounts share this email, so pin the right one in .env.local:\n` +
      `      DAYSPRING_CLI_USER_ID=${(withData[0] ?? rows[0]).id}\n` +
      "  The empty ones are duplicates from a password signup Convex Auth couldn't link to your\n" +
      "  OAuth account; safe to delete in the Convex dashboard once you've confirmed which is which.\n",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
