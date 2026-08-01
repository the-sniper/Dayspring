// The daily orchestra run (final plan Phase 1): Atlas plans → Radar researches
// → Sentinel verifies → report lands on the board + morning digest.
// Next-free core, shared by scripts/orchestra.ts, scripts/daily.ts, and (later)
// a hosted cron route. All state lives in Convex — re-running the same day is
// idempotent (an existing report short-circuits).
import { getClient } from "@/lib/claude/client";
import { api, convex } from "@/lib/convex/server";
import {
  ATLAS_CHARTER,
  buildSystem,
  RADAR_CHARTER,
  SENTINEL_CHARTER,
} from "@/lib/orchestra/charters";
import { resolveTier } from "@/lib/orchestra/tiers";
import {
  BudgetExceededError,
  dailyCapUsd,
  guardBudget,
  recordSpend,
  type Usage,
} from "@/lib/orchestra/ledger";
import {
  AtlasPlan,
  type Citation,
  Envelope,
  extractEnvelope,
  SentinelVerdict,
  todayDate,
} from "@/lib/orchestra/types";
import type { z } from "zod";

const MAX_RADAR_ATTEMPTS = 2; // initial + one Sentinel-feedback retry

type ContentBlock = {
  type: string;
  text?: string;
  citations?: { url?: string; title?: string }[] | null;
  content?: { type?: string; url?: string; title?: string }[] | null;
};

type CallResult = {
  text: string;
  citations: Citation[];
  usage: Usage;
};

// One metered model call. web_search is a server tool (two-step pattern, same
// as lib/claude/research.ts): prose + citations are walked out of the blocks.
async function meteredCall(args: {
  runDate: string;
  role: string;
  taskId?: string;
  model: string;
  system: ReturnType<typeof buildSystem>;
  user: string;
  maxTokens: number;
  webSearchUses?: number;
}): Promise<CallResult> {
  await guardBudget(args.runDate);
  const client = await getClient();
  const response = await client.messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    thinking: { type: "adaptive" },
    system: args.system as never,
    ...(args.webSearchUses
      ? {
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: args.webSearchUses,
            },
          ] as never,
        }
      : {}),
    messages: [{ role: "user", content: args.user }],
  });
  const usage = response.usage as unknown as Usage;
  await recordSpend({
    runDate: args.runDate,
    role: args.role,
    taskId: args.taskId,
    model: args.model,
    usage,
  });

  const blocks = response.content as unknown as ContentBlock[];
  const parts: string[] = [];
  const sourceMap = new Map<string, string>();
  for (const b of blocks) {
    if (b.type === "text" && b.text) {
      parts.push(b.text);
      for (const c of b.citations ?? []) {
        if (c.url) sourceMap.set(c.url, c.title || c.url);
      }
    } else if (b.type === "web_search_tool_result") {
      for (const r of b.content ?? []) {
        if (r.type === "web_search_result" && r.url) {
          sourceMap.set(r.url, r.title || r.url);
        }
      }
    }
  }
  return {
    text: parts.join("").trim(),
    citations: [...sourceMap].map(([url, title]) => ({ url, title })),
    usage,
  };
}

// Envelope-or-retry: one repair attempt with the parse error injected. A
// second failure is an incident (kind: parse_failure) and throws.
async function callWithEnvelope<T>(
  callArgs: Parameters<typeof meteredCall>[0],
  schema: z.ZodType<T>,
): Promise<{ data: T; body: string; citations: Citation[]; usage: Usage }> {
  const first = await meteredCall(callArgs);
  let parsed = extractEnvelope<T>(first.text, schema);
  if (parsed.ok) {
    return { data: parsed.data, body: parsed.body, citations: first.citations, usage: first.usage };
  }
  const retry = await meteredCall({
    ...callArgs,
    user:
      callArgs.user +
      `\n\n[SYSTEM REPAIR] Your previous reply failed envelope validation: ${parsed.error}\n` +
      `Previous reply:\n${first.text.slice(0, 6000)}\n` +
      `Re-emit the full deliverable with a valid \`\`\`json envelope.`,
  });
  parsed = extractEnvelope<T>(retry.text, schema);
  if (!parsed.ok) {
    await convex().mutation(api.orchestra.insertIncident, {
      runDate: callArgs.runDate,
      role: callArgs.role,
      ...(callArgs.taskId ? { taskId: callArgs.taskId as never } : {}),
      kind: "parse_failure",
      severity: "medium",
      detail: `Envelope invalid after retry: ${parsed.error}`,
    });
    throw new Error(`${callArgs.role}: envelope invalid after retry — ${parsed.error}`);
  }
  const citations = [...retry.citations, ...first.citations];
  return { data: parsed.data, body: parsed.body, citations, usage: retry.usage };
}

// Small, cheap data snapshot from the existing pipeline — Radar's exogenous
// Dayspring-side input. Uses only queries the digest already relies on.
async function dataSnapshot(): Promise<string> {
  const [highFit, counts] = await Promise.all([
    convex().query(api.jobs.topNewByScore, { limit: 8, minScore: 60 }),
    convex().query(api.jobs.statusCounts, {}),
  ]);
  const lines: string[] = ["### Dayspring data snapshot"];
  lines.push(
    `Pipeline counts: ${Object.entries(counts)
      .map(([k, n]) => `${k}=${n}`)
      .join(" ")}`,
  );
  if (highFit.length) {
    lines.push("New high-fit roles in the feed:");
    for (const j of highFit) {
      lines.push(`- [score ${j.matchScore}] ${j.title} — ${j.companyName}`);
    }
  } else {
    lines.push("No new high-fit roles in the feed today.");
  }
  return lines.join("\n");
}

export type OrchestraRunResult = {
  ran: boolean;
  reportBody: string;
  stats: {
    tasksTotal: number;
    verified: number;
    rejected: number;
    blocked: number;
    escalated: number;
    costUsd: number;
  };
};

export async function runOrchestra(): Promise<OrchestraRunResult> {
  const runDate = todayDate();

  // Idempotent per day: a report means the run happened.
  const existing = await convex().query(api.orchestra.latestReport, { runDate });
  if (existing) {
    return { ran: false, reportBody: existing.body, stats: existing.stats };
  }

  // A previous run today may have crashed mid-flight (e.g. a parse failure)
  // leaving tasks stranded in working states. Close them out so the board
  // reflects reality before this attempt starts fresh.
  const stale = await convex().query(api.orchestra.tasksForRun, { runDate });
  for (const t of stale) {
    if (["queued", "in_progress", "delivered"].includes(t.status)) {
      await convex().mutation(api.orchestra.setTaskStatus, {
        taskId: t._id as never,
        status: "failed",
        statusReason: "Superseded — a prior run today did not complete.",
      });
    }
  }

  const yesterdayReport = await convex().query(api.orchestra.latestReport, {});
  const snapshot = await dataSnapshot();

  // Tier is resolved ONCE per run — a mid-day switch applies from the next
  // run, so one run can never split across models (or thrash the cache).
  const tier = await resolveTier();
  const MODEL_LEAD = tier.models.lead;
  const MODEL_WORKER = tier.models.worker;

  // Whichever task is in flight when the run throws gets closed out honestly
  // instead of sitting "in_progress" forever.
  let inFlightTaskId: string | null = null;
  const failInFlight = async (reason: string, blocked: boolean) => {
    if (!inFlightTaskId) return;
    try {
      await convex().mutation(api.orchestra.setTaskStatus, {
        taskId: inFlightTaskId as never,
        status: blocked ? "blocked" : "failed",
        statusReason: reason.slice(0, 500),
      });
    } catch {
      // board cleanup is best-effort; the thrown error is the story
    }
  };

  try {

  // ---- 1. ATLAS plans the day --------------------------------------------
  const atlasTaskId: string = await convex().mutation(api.orchestra.createTask, {
    runDate,
    role: "atlas",
    objective: "Plan today's research contract for Radar and account for the day.",
    definitionOfDone: [
      "Radar contract has a specific objective and 2-4 checkable DoD items",
      "Plan reflects yesterday's report (no repeated work)",
    ],
    boundaries: ["No object-level research", "No external actions"],
    // Adaptive thinking spends from max_tokens — 2500 leaves room for both
    // reasoning and the envelope (1200 truncated: incident 2026-08-01).
    budgets: { maxOutputTokens: 2500, maxToolCalls: 0, maxUsd: 1 },
  });
  inFlightTaskId = atlasTaskId;
  await convex().mutation(api.orchestra.setTaskStatus, {
    taskId: atlasTaskId as never,
    status: "in_progress",
    bumpAttempts: true,
  });

  const atlas = await callWithEnvelope<AtlasPlan>(
    {
      runDate,
      role: "atlas",
      taskId: atlasTaskId,
      model: MODEL_LEAD,
      system: buildSystem(ATLAS_CHARTER),
      user:
        `${snapshot}\n\n### Yesterday's company report\n` +
        (yesterdayReport ? yesterdayReport.body.slice(0, 4000) : "(first run — no prior report)") +
        `\n\nPlan today's Radar contract.`,
      maxTokens: 2500,
    },
    AtlasPlan,
  );
  await convex().mutation(api.orchestra.attachArtifact, {
    taskId: atlasTaskId as never,
    runDate,
    role: "atlas",
    kind: "plan",
    honestStatus: atlas.data.status,
    summary: atlas.data.summary,
    body:
      `Objective for Radar: ${atlas.data.radarObjective}\n\n` +
      `DoD:\n${atlas.data.definitionOfDone.map((d) => `- ${d}`).join("\n")}\n\n` +
      `Focus: ${atlas.data.focusAreas.join("; ")}`,
    citations: [],
    missing: atlas.data.missing,
    uncertainties: atlas.data.uncertainties,
    model: MODEL_LEAD,
    tokensIn: atlas.usage.input_tokens ?? 0,
    tokensOut: atlas.usage.output_tokens ?? 0,
    costUsd: 0,
  });

  // ---- 2. RADAR works the contract (with one Sentinel-feedback retry) ----
  const radarTaskId: string = await convex().mutation(api.orchestra.createTask, {
    runDate,
    role: "radar",
    objective: atlas.data.radarObjective,
    definitionOfDone: atlas.data.definitionOfDone,
    boundaries: ["Research only — no drafting posts/emails, no contacting anyone"],
    budgets: { maxOutputTokens: 4000, maxToolCalls: 6, maxUsd: 2 },
  });

  let verdict: SentinelVerdict | null = null;
  let radarBody = "";
  let radarCitations: Citation[] = [];
  let escalated = false;

  for (let attempt = 1; attempt <= MAX_RADAR_ATTEMPTS; attempt++) {
    inFlightTaskId = radarTaskId;
    await convex().mutation(api.orchestra.setTaskStatus, {
      taskId: radarTaskId as never,
      status: "in_progress",
      bumpAttempts: true,
    });
    const feedback =
      verdict && verdict.verdict !== "confirmed"
        ? `\n\n### Verifier feedback on your previous attempt (fix ALL of it)\n${verdict.summary}\n` +
          verdict.incidents.map((i) => `- [${i.kind}] ${i.detail}`).join("\n")
        : "";
    const radar = await callWithEnvelope<Envelope>(
      {
        runDate,
        role: "radar",
        taskId: radarTaskId,
        model: MODEL_WORKER,
        system: buildSystem(RADAR_CHARTER),
        user:
          `### Task contract\nObjective: ${atlas.data.radarObjective}\n` +
          `Definition of done:\n${atlas.data.definitionOfDone.map((d) => `- ${d}`).join("\n")}\n` +
          `Focus areas: ${atlas.data.focusAreas.join("; ")}\n\n${snapshot}${feedback}`,
        maxTokens: 4000,
        webSearchUses: 6,
      },
      Envelope,
    );
    radarBody = radar.body;
    radarCitations = radar.citations;
    await convex().mutation(api.orchestra.attachArtifact, {
      taskId: radarTaskId as never,
      runDate,
      role: "radar",
      kind: "brief",
      honestStatus: radar.data.status,
      summary: radar.data.summary,
      body: radar.body,
      citations: radar.citations,
      missing: radar.data.missing,
      uncertainties: radar.data.uncertainties,
      model: MODEL_WORKER,
      tokensIn: radar.usage.input_tokens ?? 0,
      tokensOut: radar.usage.output_tokens ?? 0,
      costUsd: 0,
    });

    // ---- 3. SENTINEL verifies ------------------------------------------
    const sentinelTaskId: string = await convex().mutation(
      api.orchestra.createTask,
      {
        runDate,
        role: "sentinel",
        objective: `Adversarially verify Radar's brief (attempt ${attempt}) against its contract.`,
        definitionOfDone: [
          "Every load-bearing claim checked against a cited source",
          "Every DoD item explicitly assessed",
        ],
        boundaries: ["Verify against the contract, not a preferred bigger task"],
        budgets: { maxOutputTokens: 3000, maxToolCalls: 3, maxUsd: 1.5 },
      },
    );
    inFlightTaskId = sentinelTaskId;
    await convex().mutation(api.orchestra.setTaskStatus, {
      taskId: sentinelTaskId as never,
      status: "in_progress",
    });
    const sentinel = await callWithEnvelope<SentinelVerdict>(
      {
        runDate,
        role: "sentinel",
        taskId: sentinelTaskId,
        model: MODEL_LEAD,
        system: buildSystem(SENTINEL_CHARTER),
        user:
          `### The contract Radar worked under\nObjective: ${atlas.data.radarObjective}\n` +
          `Definition of done:\n${atlas.data.definitionOfDone.map((d) => `- ${d}`).join("\n")}\n\n` +
          `### Radar's deliverable (attempt ${attempt} of ${MAX_RADAR_ATTEMPTS})\n${radarBody}\n\n` +
          `### Sources Radar actually saw this run\n` +
          (radarCitations.length
            ? radarCitations.map((c) => `- ${c.title}: ${c.url}`).join("\n")
            : "(none)"),
        maxTokens: 3000,
        webSearchUses: 3,
      },
      SentinelVerdict,
    );
    verdict = sentinel.data;
    await convex().mutation(api.orchestra.attachArtifact, {
      taskId: sentinelTaskId as never,
      runDate,
      role: "sentinel",
      kind: "verdict",
      honestStatus: sentinel.data.status,
      summary: sentinel.data.summary,
      body:
        `Verdict: ${sentinel.data.verdict}\n\n` +
        sentinel.data.checkedClaims
          .map((c) => `- [${c.holds ? "OK" : "FAIL"}] ${c.claim} — ${c.note}`)
          .join("\n"),
      citations: sentinel.citations,
      missing: sentinel.data.missing,
      uncertainties: sentinel.data.uncertainties,
      model: MODEL_LEAD,
      tokensIn: sentinel.usage.input_tokens ?? 0,
      tokensOut: sentinel.usage.output_tokens ?? 0,
      costUsd: 0,
    });
    for (const inc of sentinel.data.incidents) {
      await convex().mutation(api.orchestra.insertIncident, {
        runDate,
        taskId: radarTaskId as never,
        role: "radar",
        kind: inc.kind,
        severity: inc.severity,
        detail: inc.detail,
      });
    }

    const lastAttempt = attempt === MAX_RADAR_ATTEMPTS;
    await convex().mutation(api.orchestra.recordVerdict, {
      taskId: radarTaskId as never,
      verdict: sentinel.data.verdict,
      verificationNotes: sentinel.data.summary,
      onFail: sentinel.data.verdict !== "confirmed" && !lastAttempt ? "queued" : "escalated",
    });
    if (sentinel.data.verdict === "confirmed") break;
    if (lastAttempt) escalated = true;
  }

  // ---- 4. Report (assembled by code — no LLM cost) -----------------------
  const spend = await convex().query(api.orchestra.spendForDate, { runDate });
  const confirmed = verdict?.verdict === "confirmed";
  const stats = {
    tasksTotal: 2 + (verdict ? 1 : 0),
    verified: confirmed ? 1 : 0,
    rejected: verdict?.verdict === "refuted" ? 1 : 0,
    blocked: 0,
    escalated: escalated ? 1 : 0,
    costUsd: Math.round(spend.costUsd * 100) / 100,
  };
  const lines: string[] = [];
  lines.push(`ORCHESTRA — ${runDate}`);
  lines.push(
    confirmed
      ? `Radar's brief: VERIFIED by Sentinel.`
      : `Radar's brief: ${verdict?.verdict ?? "no verdict"} — ESCALATED to you (see notes).`,
  );
  lines.push("");
  lines.push(radarBody || "(no brief produced)");
  if (verdict && !confirmed) {
    lines.push("");
    lines.push(`Sentinel's objection: ${verdict.summary}`);
  }
  lines.push("");
  lines.push(
    `Spend: $${stats.costUsd.toFixed(2)} of $${dailyCapUsd().toFixed(2)} cap (${spend.calls} calls).`,
  );
  const reportBody = lines.join("\n");

  await convex().mutation(api.orchestra.insertReport, {
    runDate,
    body: reportBody,
    stats,
  });
  return { ran: true, reportBody, stats };
  } catch (err) {
    await failInFlight(
      err instanceof Error ? err.message : String(err),
      err instanceof BudgetExceededError,
    );
    throw err;
  }
}

export { BudgetExceededError };
