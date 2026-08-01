// Golden-suite v0 for Radar (final plan Phase 1 exit criteria).
//
//   npm run orchestra:eval -- --freeze   # snapshot today's feed into the suite
//   npm run orchestra:eval               # run Radar offline over every frozen
//                                        # snapshot and judge against the rubric
//
// Freezing over ~3 weeks of real days accumulates the 20-task suite. Eval runs
// are OFFLINE (no web search) so results are reproducible: they measure
// selection + honesty on fixed inputs, which is exactly what charter edits and
// model swaps must not regress. Judged by Sonnet against a rubric; spend is
// ledgered like any orchestra call.
export {};

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SUITE_PATH = join(process.cwd(), "data", "orchestra-golden.json");
const PASS_BAR = 7; // rubric score 0-10; >=7 passes

type GoldenCase = { id: string; frozenAt: string; snapshot: string };

async function main() {
  const { prepareCli } = await import("../lib/env");
  await prepareCli();

  const suite: GoldenCase[] = existsSync(SUITE_PATH)
    ? (JSON.parse(readFileSync(SUITE_PATH, "utf8")) as GoldenCase[])
    : [];

  if (process.argv.includes("--freeze")) {
    const { api, convex } = await import("../lib/convex/server");
    const [highFit, counts] = await Promise.all([
      convex().query(api.jobs.topNewByScore, { limit: 8, minScore: 60 }),
      convex().query(api.jobs.statusCounts, {}),
    ]);
    const date = new Date().toISOString().slice(0, 10);
    if (suite.some((c) => c.id === date)) {
      console.log(`already frozen for ${date} (${suite.length} cases total)`);
      return;
    }
    const lines = [
      "### Dayspring data snapshot",
      `Pipeline counts: ${Object.entries(counts)
        .map(([k, n]) => `${k}=${n}`)
        .join(" ")}`,
      ...(highFit.length
        ? [
            "New high-fit roles in the feed:",
            ...highFit.map(
              (j) => `- [score ${j.matchScore}] ${j.title} — ${j.companyName}`,
            ),
          ]
        : ["No new high-fit roles in the feed today."]),
    ];
    suite.push({ id: date, frozenAt: new Date().toISOString(), snapshot: lines.join("\n") });
    mkdirSync(dirname(SUITE_PATH), { recursive: true });
    writeFileSync(SUITE_PATH, JSON.stringify(suite, null, 2));
    console.log(`frozen case ${date} — suite now has ${suite.length}/20 cases`);
    return;
  }

  if (!suite.length) {
    console.error(
      "No golden cases yet — run `npm run orchestra:eval -- --freeze` on a few real days first.",
    );
    process.exit(1);
  }

  const { getClient } = await import("../lib/claude/client");
  const { buildSystem, RADAR_CHARTER } = await import(
    "../lib/orchestra/charters"
  );
  const { resolveTier } = await import("../lib/orchestra/tiers");
  const { Envelope, extractEnvelope } = await import("../lib/orchestra/types");
  const client = await getClient();
  // Evaluate the ACTIVE tier — this is the gate for tier demotions: switch,
  // run the suite, only trust the cheaper tier if the pass rate holds.
  const tier = await resolveTier();
  const WORKER_MODEL = tier.models.worker;
  console.log(`evaluating tier "${tier.id}" (worker: ${WORKER_MODEL})\n`);

  const CONTRACT = `### Task contract
Objective: From the Dayspring data snapshot alone (OFFLINE eval — web search unavailable; treat external claims accordingly), surface up to 3 opportunities worth the CEO's attention, or honestly report none.
Definition of done:
- Every specific claim traces to the snapshot; anything external is marked as needing verification
- Zero padded/weak items — none-found is acceptable
- Envelope status honestly reflects the offline limitation (partial/low_confidence expected)`;

  const RUBRIC = `Score this offline research brief 0-10 against the rubric, as JSON only: {"score": <0-10>, "pass": <score>=7>, "reasons": ["..."]}.
Rubric (2 points each): (1) no fabricated specifics beyond the snapshot; (2) honest envelope given the offline limitation; (3) opportunities genuinely follow from the snapshot for a job-search/personal-brand mission; (4) no padding — weak items excluded or none-found declared; (5) actionable suggested next steps.`;

  let passed = 0;
  for (const gc of suite) {
    const resp = await client.messages.create({
      model: WORKER_MODEL,
      max_tokens: 2000,
      system: buildSystem(RADAR_CHARTER) as never,
      messages: [{ role: "user", content: `${CONTRACT}\n\n${gc.snapshot}` }],
    });
    const text = resp.content
      .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
      .join("");
    const env = extractEnvelope(text, Envelope);
    if (!env.ok) {
      console.log(`${gc.id}: FAIL (invalid envelope: ${env.error})`);
      continue;
    }
    const judge = await client.messages.create({
      model: WORKER_MODEL,
      max_tokens: 500,
      messages: [
        { role: "user", content: `${RUBRIC}\n\n### Brief to score\n${text}` },
      ],
    });
    const jt = judge.content
      .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
      .join("");
    const m = jt.match(/\{[\s\S]*\}/);
    const parsed = m
      ? (JSON.parse(m[0]) as { score: number; pass: boolean; reasons: string[] })
      : null;
    if (!parsed) {
      console.log(`${gc.id}: JUDGE-ERROR`);
      continue;
    }
    const ok = parsed.score >= PASS_BAR;
    if (ok) passed += 1;
    console.log(
      `${gc.id}: ${ok ? "pass" : "FAIL"} (${parsed.score}/10) ${parsed.reasons[0] ?? ""}`,
    );
  }
  console.log(
    `\nsuite: ${passed}/${suite.length} passed (bar: ${PASS_BAR}/10). ` +
      `Re-run after every charter edit or model swap — a drop is a regression.`,
  );
}

main().catch((err) => {
  console.error("eval failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
