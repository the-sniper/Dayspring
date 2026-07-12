// The automated daily run (blueprint step 7): pull → score → check replies →
// digest. Wired to launchd via `npm run cron:install`; run manually with
// `npm run daily`. Never sends outreach or spends Apollo credits — automation
// preps, the human triggers.
export {}; // module scope

const SCORE_CAP = 50; // per-run ceiling on Sonnet spend (~$1.50 max)

async function main() {
  const { prepareCli } = await import("../lib/env");
  await prepareCli();

  const { pullAllJobs } = await import("../lib/jobs/pull");
  const { scoreUnscored } = await import("../lib/jobs/score");
  const { hasApiKey } = await import("../lib/claude/client");
  const { checkReplies } = await import("../lib/outreach/replies");
  const { hasGmail, getGmailConfig, sendEmail } = await import(
    "../lib/integrations/gmail/client"
  );
  const { assembleDigest } = await import("../lib/digest");
  const { setSetting } = await import("../lib/settings/store");

  const errors: string[] = [];
  console.log(`[${new Date().toISOString()}] daily run starting`);

  // 1. Pull
  const pull = await pullAllJobs();
  const added = pull.perCompany.reduce((n, c) => n + c.added, 0);
  for (const e of pull.errors) errors.push(`pull ${e.name}: ${e.message}`);
  console.log(`pulled: +${added} new (${pull.classified} titles classified)`);

  // 2. Score, capped
  let scored = 0;
  if (await hasApiKey()) {
    while (scored < SCORE_CAP) {
      const res = await scoreUnscored(Math.min(25, SCORE_CAP - scored));
      if ("profileMissing" in res) {
        errors.push("scoring skipped — no profile in Settings");
        break;
      }
      scored += res.scored;
      for (const e of res.errors) errors.push(`score: ${e}`);
      if (res.scored === 0 || res.remaining === 0) break;
    }
    console.log(`scored: ${scored} (cap ${SCORE_CAP})`);
  } else {
    errors.push("scoring skipped — no ANTHROPIC_API_KEY");
  }

  // 3. Reply detection
  let repliesFound = 0;
  if (await hasGmail()) {
    const replies = await checkReplies();
    repliesFound = replies.found;
    console.log(`replies: ${replies.found} of ${replies.checked} threads`);
  }

  // 4. Digest
  const digest = await assembleDigest({ added, scored, repliesFound, errors });
  await setSetting("lastDailyRun", new Date().toISOString());

  const email = (await getGmailConfig())?.email;
  if ((await hasGmail()) && email) {
    try {
      await sendEmail({ to: email, subject: digest.subject, body: digest.text });
      console.log(`digest emailed to ${email}`);
    } catch (err) {
      console.error("digest email failed — printing instead:");
      console.log("\n" + digest.text);
    }
  } else {
    console.log("\n" + digest.text);
  }

  console.log(`[${new Date().toISOString()}] daily run done`);
}

main().catch((err) => {
  console.error("daily run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
