// Re-triage LinkedIn posts already in the table against the US-only filter.
//
// The filter runs at pull time now, but rows pulled before it existed are still
// sitting in the feed — mostly offshore staffing posts listing fifteen roles
// with the location given as a bare "Remote". This walks the untriaged ones and
// files the non-US ones away as `ignored` with reason "not_us", exactly as a
// fresh pull would.
//
// Cheap by construction: the deterministic verdict (shared/us-location.ts)
// decides most rows for free, and only the genuinely ambiguous ones cost a
// model call.
//
//   npx tsx scripts/triage-us.ts            # report only, changes nothing
//   npx tsx scripts/triage-us.ts --apply    # actually file them away
export {};

async function main() {
  const apply = process.argv.includes("--apply");

  const { prepareCli } = await import("../lib/env");
  await prepareCli();

  const { api, convex } = await import("../lib/convex/server");
  const { isUsOpening, usLocationVerdict } = await import("../shared/us-location");
  const { EXTRACT_BATCH_LIMIT, classifyUsBatch } = await import("../lib/linkedin/extract");
  const { hasApiKey } = await import("../lib/claude/client");
  const { hasOpenAIKey } = await import("../lib/ai/openai");

  // Everything currently visible in the feed.
  const { rows, total } = await convex().query(api.linkedinPosts.feed, {
    status: "new",
    q: "",
    withLinkOnly: false,
    postedCutoff: null,
    sort: "newest",
    page: 1,
    pageSize: 1000,
  });
  console.log(`\n🌅 US re-triage — ${rows.length} of ${total} untriaged posts\n`);
  if (rows.length === 0) return;

  type Row = (typeof rows)[number];
  const keep: Row[] = [];
  const drop: { row: Row; why: string }[] = [];
  const unsure: Row[] = [];

  for (const row of rows) {
    const verdict = usLocationVerdict(row.text, row.location);
    if (verdict === "us") keep.push(row);
    else if (verdict === "non_us") drop.push({ row, why: "non-US location" });
    else unsure.push(row);
  }
  console.log(
    `   deterministic: ${keep.length} US · ${drop.length} non-US · ${unsure.length} need a model call`,
  );

  const canClassify = (await hasApiKey()) || (await hasOpenAIKey());
  if (unsure.length > 0 && !canClassify) {
    console.log(`   (no model key — leaving the ${unsure.length} ambiguous posts alone)`);
  } else {
    for (let i = 0; i < unsure.length; i += EXTRACT_BATCH_LIMIT) {
      const batch = unsure.slice(i, i + EXTRACT_BATCH_LIMIT);
      let verdicts: (boolean | null)[] = batch.map(() => null);
      try {
        verdicts = await classifyUsBatch(
          batch.map((r) => ({ text: r.text, location: r.location })),
        );
      } catch (err) {
        console.log(`   batch ${i} failed, leaving it alone: ${err instanceof Error ? err.message : err}`);
      }
      batch.forEach((row, j) => {
        const v = verdicts[j];
        if (v === null) return; // model didn't answer — leave it in the feed
        if (isUsOpening(v, "unknown")) keep.push(row);
        else drop.push({ row, why: "no US evidence" });
      });
      process.stdout.write(`   classified ${Math.min(i + batch.length, unsure.length)}/${unsure.length}\r`);
    }
    console.log("");
  }

  console.log(`\n   → keep ${keep.length} · file away ${drop.length}\n`);
  for (const { row, why } of drop.slice(0, 25)) {
    const who = row.companyName ?? row.authorName;
    console.log(`   ✗ ${who} — ${row.location ?? "no location"}  (${why})`);
  }
  if (drop.length > 25) console.log(`   … and ${drop.length - 25} more`);

  if (!apply) {
    console.log(`\n   Dry run. Re-run with --apply to file these away.\n`);
    return;
  }
  let done = 0;
  for (const { row } of drop) {
    await convex().mutation(api.linkedinPosts.patch, {
      id: row.id,
      patch: { status: "ignored", ignoredReason: "not_us", inUs: false },
    });
    done++;
    if (done % 20 === 0) process.stdout.write(`   filed ${done}/${drop.length}\r`);
  }
  // Mark the survivors so a future re-triage skips them for free.
  for (const row of keep) {
    await convex().mutation(api.linkedinPosts.patch, {
      id: row.id,
      patch: { inUs: true },
    });
  }
  console.log(`\n   ✓ filed ${done} non-US posts away; ${keep.length} US posts remain in the feed.\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
