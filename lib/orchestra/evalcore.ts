// Golden-suite core (Phase 1/5) — shared by the CLI script and the /company/team
// UI buttons, so calibration never requires a terminal.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getClient } from "@/lib/claude/client";
import { api, convex } from "@/lib/convex/server";
import { buildSystem, RADAR_CHARTER } from "@/lib/orchestra/charters";
import { getSetting, setSetting } from "@/lib/settings/store";
import { resolveTier } from "@/lib/orchestra/tiers";
import { Envelope, extractEnvelope } from "@/lib/orchestra/types";

const SUITE_PATH = join(process.cwd(), "data", "orchestra-golden.json");
const PASS_BAR = 7;

export type GoldenCase = { id: string; frozenAt: string; snapshot: string };
export type Calibration = {
  date: string;
  tier: string;
  passed: number;
  total: number;
};

function loadSuite(): GoldenCase[] {
  return existsSync(SUITE_PATH)
    ? (JSON.parse(readFileSync(SUITE_PATH, "utf8")) as GoldenCase[])
    : [];
}

export async function getCalibrations(): Promise<Calibration[]> {
  const raw = await getSetting("orchCalibrations");
  return raw ? (JSON.parse(raw) as Calibration[]) : [];
}

export function suiteSize(): number {
  return loadSuite().length;
}

export async function freezeGoldenCase(): Promise<string> {
  const suite = loadSuite();
  const date = new Date().toISOString().slice(0, 10);
  if (suite.some((c) => c.id === date)) {
    return `Already frozen for ${date} (${suite.length} cases total).`;
  }
  const [highFit, counts] = await Promise.all([
    convex().query(api.jobs.topNewByScore, { limit: 8, minScore: 60 }),
    convex().query(api.jobs.statusCounts, {}),
  ]);
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
  return `Frozen case ${date} — suite now has ${suite.length}/20 cases.`;
}

const CONTRACT = `### Task contract
Objective: From the Dayspring data snapshot alone (OFFLINE eval — web search unavailable; treat external claims accordingly), surface up to 3 opportunities worth the CEO's attention, or honestly report none.
Definition of done:
- Every specific claim traces to the snapshot; anything external is marked as needing verification
- Zero padded/weak items — none-found is acceptable
- Envelope status honestly reflects the offline limitation (partial/low_confidence expected)`;

const RUBRIC = `Score this offline research brief 0-10 against the rubric, as JSON only: {"score": <0-10>, "pass": <score>=7>, "reasons": ["..."]}.
Rubric (2 points each): (1) no fabricated specifics beyond the snapshot; (2) honest envelope given the offline limitation; (3) opportunities genuinely follow from the snapshot for a job-search/personal-brand mission; (4) no padding — weak items excluded or none-found declared; (5) actionable suggested next steps.`;

export async function runGoldenSuite(): Promise<{
  lines: string[];
  passed: number;
  total: number;
  delta: number | null;
}> {
  const suite = loadSuite();
  if (!suite.length) {
    return {
      lines: ["No golden cases yet — freeze a few real days first."],
      passed: 0,
      total: 0,
      delta: null,
    };
  }
  const tier = await resolveTier();
  const client = await getClient();
  const out: string[] = [`Evaluating tier "${tier.id}" (worker: ${tier.models.worker})`];
  let passed = 0;
  for (const gc of suite) {
    const resp = await client.messages.create({
      model: tier.models.worker,
      max_tokens: 2000,
      system: buildSystem(RADAR_CHARTER) as never,
      messages: [{ role: "user", content: `${CONTRACT}\n\n${gc.snapshot}` }],
    });
    const text = resp.content
      .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
      .join("");
    const env = extractEnvelope(text, Envelope);
    if (!env.ok) {
      out.push(`${gc.id}: FAIL (invalid envelope)`);
      continue;
    }
    const judge = await client.messages.create({
      model: tier.models.worker,
      max_tokens: 500,
      messages: [{ role: "user", content: `${RUBRIC}\n\n### Brief to score\n${text}` }],
    });
    const jt = judge.content
      .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
      .join("");
    const m = jt.match(/\{[\s\S]*\}/);
    let score: number | null = null;
    try {
      score = m ? (JSON.parse(m[0]) as { score: number }).score : null;
    } catch {
      score = null;
    }
    if (score === null) {
      out.push(`${gc.id}: JUDGE-ERROR`);
      continue;
    }
    const ok = score >= PASS_BAR;
    if (ok) passed += 1;
    out.push(`${gc.id}: ${ok ? "pass" : "FAIL"} (${score}/10)`);
  }
  out.push(`Suite: ${passed}/${suite.length} passed (bar ${PASS_BAR}/10).`);

  const history = await getCalibrations();
  const prev = [...history].reverse().find((c) => c.tier === tier.id);
  history.push({
    date: new Date().toISOString().slice(0, 10),
    tier: tier.id,
    passed,
    total: suite.length,
  });
  await setSetting("orchCalibrations", JSON.stringify(history.slice(-12)));
  let delta: number | null = null;
  if (prev && prev.total > 0) {
    delta = Math.round((passed / suite.length - prev.passed / prev.total) * 100);
    out.push(
      `Calibration vs ${prev.date} (same tier): ${delta >= 0 ? "+" : ""}${delta} pts` +
        (delta < -10 ? " ⚠ REGRESSION — revert the last charter/tier change." : ""),
    );
  } else {
    out.push(`Calibration baseline recorded for tier "${tier.id}".`);
  }
  return { lines: out, passed, total: suite.length, delta };
}
