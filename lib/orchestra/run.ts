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
  COMPASS_CHARTER,
  HERALD_CHARTER,
  QUILL_CHARTER,
  RADAR_CHARTER,
  SENTINEL_CHARTER,
  SENTINEL_CONTENT_ADDENDUM,
  SENTINEL_OUTREACH_ADDENDUM,
} from "@/lib/orchestra/charters";
import { resolveTier } from "@/lib/orchestra/tiers";
import {
  BudgetExceededError,
  dailyCapUsd,
  guardBudget,
  recordSpend,
  type Usage,
} from "@/lib/orchestra/ledger";
import { memoryBlock } from "@/lib/orchestra/memory";
import { fmtDate, fmtTime } from "@/lib/orchestra/format";
import { displayName } from "@/lib/orchestra/registry";
import { vigilScan } from "@/lib/orchestra/watch";
import {
  AtlasPlan,
  type Citation,
  CompassPlan,
  Envelope,
  extractEnvelope,
  HeraldDraft,
  QuillDraft,
  SentinelContentAudit,
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
  // "max_tokens" here means the reply was cut off — see callWithEnvelope.
  stopReason: string | null;
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
  // Why the model stopped. Without this, a reply cut off at max_tokens and a
  // reply that simply ignored the format are indistinguishable — both surface
  // as "No JSON envelope found", which is what made radar's failure opaque.
  const stopReason = (response as unknown as { stop_reason?: string }).stop_reason ?? null;
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
    stopReason,
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
  // The envelope goes LAST, so a reply cut off at max_tokens loses exactly the
  // envelope and nothing else. Asking such a reply to "re-emit the full
  // deliverable" makes it longer and it truncates again — the old repair could
  // not fix the one failure it was most likely to face. Ask only for the
  // envelope instead, and give it room.
  const truncated = first.stopReason === "max_tokens";
  const repairUser = truncated
    ? `${callArgs.user}\n\n[SYSTEM REPAIR] Your previous reply was cut off before its \`\`\`json envelope.\n` +
      `Do NOT rewrite the deliverable. Reply with ONLY the \`\`\`json envelope summarising the work below.\n` +
      `Your previous reply (for reference):\n${first.text.slice(0, 6000)}`
    : `${callArgs.user}\n\n[SYSTEM REPAIR] Your previous reply failed envelope validation: ${parsed.error}\n` +
      `Previous reply:\n${first.text.slice(0, 6000)}\n` +
      `Re-emit the full deliverable with a valid \`\`\`json envelope.`;
  const retry = await meteredCall({
    ...callArgs,
    user: repairUser,
    // Envelope-only replies are short, but the cap has to clear adaptive
    // thinking before any text is emitted at all.
    maxTokens: truncated ? Math.max(callArgs.maxTokens, 6000) : callArgs.maxTokens,
  });
  parsed = extractEnvelope<T>(retry.text, schema);
  if (!parsed.ok) {
    // Name the stop reason: "ran out of tokens" and "ignored the format" need
    // different fixes, and the old message covered both with one sentence.
    const why =
      retry.stopReason === "max_tokens"
        ? ` (both replies hit the ${callArgs.maxTokens}-token cap before the envelope — raise this role's maxTokens)`
        : retry.stopReason && retry.stopReason !== "end_turn"
          ? ` (stop_reason: ${retry.stopReason})`
          : "";
    await convex().mutation(api.orchestra.insertIncident, {
      runDate: callArgs.runDate,
      role: callArgs.role,
      ...(callArgs.taskId ? { taskId: callArgs.taskId as never } : {}),
      kind: "parse_failure",
      severity: "medium",
      detail: `Envelope invalid after retry: ${parsed.error}${why}`,
    });
    throw new Error(`${callArgs.role}: envelope invalid after retry — ${parsed.error}${why}`);
  }
  const citations = [...retry.citations, ...first.citations];
  return { data: parsed.data, body: parsed.body, citations, usage: retry.usage };
}

// Small, cheap data snapshot from the existing pipeline — Radar's exogenous
// Dayspring-side input. Uses only queries the digest already relies on.
async function dataSnapshot(): Promise<string> {
  // Incident-driven shape (2026-08-01: Radar correctly blocked because the
  // snapshot exposed pipeline COUNTS but no company names — un-researchable).
  // Now includes the named pipeline rows alongside the counts.
  const { KANBAN_STATUSES } = await import("@/lib/types");
  const [highFit, counts, active] = await Promise.all([
    convex().query(api.jobs.topNewByScore, { limit: 8, minScore: 60 }),
    convex().query(api.jobs.statusCounts, {}),
    convex().query(api.jobs.byStatuses, { statuses: [...KANBAN_STATUSES] }),
  ]);
  const lines: string[] = ["### Dayspring data snapshot"];
  lines.push(
    `Pipeline counts: ${Object.entries(counts)
      .map(([k, n]) => `${k}=${n}`)
      .join(" ")}`,
  );
  const named = active
    .filter((j) => j.status !== "rejected")
    .slice(0, 15);
  if (named.length) {
    lines.push("Pipeline (named):");
    for (const j of named) {
      lines.push(`- [${j.status}] ${j.title} — ${j.companyName}`);
    }
  }
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

  // Vigil: what changed on the platform since the last run? Atlas plans
  // around this; the report surfaces it to the CEO.
  const vigil = await vigilScan();
  const vigilBlock = vigil.firstRun
    ? "(first run — baseline recorded)"
    : vigil.changes.length
      ? vigil.changes.map((c) => `- ${c}`).join("\n")
      : "(no changes since last run)";

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
    objective: `Plan today's research contract for ${displayName("radar")} and account for the day.`,
    definitionOfDone: [
      `${displayName("radar")} contract has a specific objective and 2-4 checkable DoD items`,
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
        `${snapshot}\n\n### Platform changes since last run (${displayName("vigil")})\n${vigilBlock}\n\n` +
        `### Yesterday's company report\n` +
        (yesterdayReport ? yesterdayReport.body.slice(0, 4000) : "(first run — no prior report)") +
        `\n\nPlan today's ${displayName("radar")} contract. If ${displayName("vigil")} reports a change (new resume, ` +
        `new headline, edited voice, new targets), reflect it in the contract instead of repeating yesterday's framing.`,
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
      `Objective for ${displayName("radar")}: ${atlas.data.radarObjective}\n\n` +
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
    budgets: { maxOutputTokens: 8000, maxToolCalls: 6, maxUsd: 2 },
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
        maxTokens: 8000,
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
        objective: `Adversarially verify ${displayName("radar")}'s brief (attempt ${attempt}) against its contract.`,
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
          `### The contract ${displayName("radar")} worked under\nObjective: ${atlas.data.radarObjective}\n` +
          `Definition of done:\n${atlas.data.definitionOfDone.map((d) => `- ${d}`).join("\n")}\n\n` +
          `### ${displayName("radar")}'s deliverable (attempt ${attempt} of ${MAX_RADAR_ATTEMPTS})\n${radarBody}\n\n` +
          `### Sources ${displayName("radar")} actually saw this run\n` +
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

  // ---- 3.5 Content pipeline (Phase 2): Compass → Quill → Sentinel audit --
  const confirmed = verdict?.verdict === "confirmed";
  let draftsQueued = 0;
  let compassNote = "";
  if (confirmed) {
    const memory = await memoryBlock();
    const compassTaskId: string = await convex().mutation(
      api.orchestra.createTask,
      {
        runDate,
        role: "compass",
        objective: `Decide today's post angles (0-2) from ${displayName("radar")}'s verified brief.`,
        definitionOfDone: [
          `Every angle cites source URLs from ${displayName("radar")}'s brief`,
          "Zero angles is explicit, not implicit",
          "Banned-topics and lessons files respected",
        ],
        boundaries: ["No drafting", "No posting", "No outreach decisions"],
        budgets: { maxOutputTokens: 2000, maxToolCalls: 0, maxUsd: 1 },
      },
    );
    inFlightTaskId = compassTaskId;
    await convex().mutation(api.orchestra.setTaskStatus, {
      taskId: compassTaskId as never,
      status: "in_progress",
      bumpAttempts: true,
    });
    const compass = await callWithEnvelope<CompassPlan>(
      {
        runDate,
        role: "compass",
        taskId: compassTaskId,
        model: MODEL_LEAD,
        system: buildSystem(COMPASS_CHARTER),
        user:
          `${memory}\n\n### ${displayName("radar")}'s verified brief\n${radarBody}\n\n### ${displayName("radar")}'s sources\n` +
          radarCitations.map((c) => `- ${c.title}: ${c.url}`).join("\n") +
          `\n\nDecide today's angles.`,
        maxTokens: 2000,
      },
      CompassPlan,
    );
    await convex().mutation(api.orchestra.attachArtifact, {
      taskId: compassTaskId as never,
      runDate,
      role: "compass",
      kind: "memo",
      honestStatus: compass.data.status,
      summary: compass.data.summary,
      body: compass.data.angles.length
        ? compass.data.angles
            .map(
              (a, i) =>
                `### Angle ${i} (${a.platform})\n${a.angle}\nWhy now: ${a.why}\nSources: ${a.sourceUrls.join(", ")}`,
            )
            .join("\n\n")
        : "Decision: nothing worth posting today (silence chosen).",
      citations: [],
      missing: compass.data.missing,
      uncertainties: compass.data.uncertainties,
      model: MODEL_LEAD,
      tokensIn: compass.usage.input_tokens ?? 0,
      tokensOut: compass.usage.output_tokens ?? 0,
      costUsd: 0,
    });
    compassNote = compass.data.summary;

    if (compass.data.angles.length === 0) {
      // Silence is low-risk (nothing external can result), so no audit call.
      await convex().mutation(api.orchestra.recordVerdict, {
        taskId: compassTaskId as never,
        verdict: "confirmed",
        verificationNotes: "Chose silence — no drafts to audit.",
      });
    } else {
      // Quill: one draft per angle, one call each (small context per call).
      const drafts: {
        taskId: string;
        angle: (typeof compass.data.angles)[number];
        draft: QuillDraft;
      }[] = [];
      for (const [i, angle] of compass.data.angles.entries()) {
        const quillTaskId: string = await convex().mutation(
          api.orchestra.createTask,
          {
            runDate,
            role: "quill",
            objective: `Draft one ${angle.platform} post: ${angle.angle.slice(0, 120)}`,
            definitionOfDone: [
              "Voice matches the brand-voice file",
              "Every specific traces to the angle's sources",
              angle.platform === "x"
                ? "≤280 characters, one idea"
                : "100-200 words, scannable",
            ],
            boundaries: ["Draft only — posting is the CEO's"],
            budgets: { maxOutputTokens: 1500, maxToolCalls: 0, maxUsd: 0.5 },
          },
        );
        inFlightTaskId = quillTaskId;
        await convex().mutation(api.orchestra.setTaskStatus, {
          taskId: quillTaskId as never,
          status: "in_progress",
          bumpAttempts: true,
        });
        const quill = await callWithEnvelope<QuillDraft>(
          {
            runDate,
            role: "quill",
            taskId: quillTaskId,
            model: MODEL_WORKER,
            system: buildSystem(QUILL_CHARTER),
            user:
              `${memory}\n\n### Angle memo (${angle.platform})\n${angle.angle}\nWhy now: ${angle.why}\nSources you may cite:\n` +
              angle.sourceUrls.map((u) => `- ${u}`).join("\n") +
              `\n\n### ${displayName("radar")} context (excerpt)\n${radarBody.slice(0, 3000)}\n\nWrite the post.`,
            maxTokens: 1500,
          },
          QuillDraft,
        );
        await convex().mutation(api.orchestra.attachArtifact, {
          taskId: quillTaskId as never,
          runDate,
          role: "quill",
          kind: "draft",
          honestStatus: quill.data.status,
          summary: quill.data.summary,
          body: quill.data.text,
          citations: angle.sourceUrls.map((u) => ({ title: u, url: u })),
          missing: quill.data.missing,
          uncertainties: quill.data.uncertainties,
          model: MODEL_WORKER,
          tokensIn: quill.usage.input_tokens ?? 0,
          tokensOut: quill.usage.output_tokens ?? 0,
          costUsd: 0,
        });
        drafts.push({ taskId: quillTaskId, angle, draft: quill.data });
        void i;
      }

      // One Sentinel audit over the memo + ALL drafts (batch: one lead call).
      const auditTaskId: string = await convex().mutation(
        api.orchestra.createTask,
        {
          runDate,
          role: "sentinel",
          objective: `Audit ${displayName("compass")}'s memo + ${drafts.length} draft(s) before the approval queue.`,
          definitionOfDone: [
            "Every draft checked: claims vs sources, banned topics, voice, platform fit",
          ],
          boundaries: ["Audit against the memory files, not personal taste"],
          budgets: { maxOutputTokens: 2500, maxToolCalls: 0, maxUsd: 1.5 },
        },
      );
      inFlightTaskId = auditTaskId;
      await convex().mutation(api.orchestra.setTaskStatus, {
        taskId: auditTaskId as never,
        status: "in_progress",
      });
      const audit = await callWithEnvelope<SentinelContentAudit>(
        {
          runDate,
          role: "sentinel",
          taskId: auditTaskId,
          model: MODEL_LEAD,
          system: buildSystem(
            SENTINEL_CHARTER + "\n\n" + SENTINEL_CONTENT_ADDENDUM,
          ),
          user:
            `${memory}\n\n### ${displayName("compass")}'s memo\n` +
            compass.data.angles
              .map((a, i) => `Angle ${i} (${a.platform}): ${a.angle} — why: ${a.why} — sources: ${a.sourceUrls.join(", ")}`)
              .join("\n") +
            `\n\n### Drafts\n` +
            drafts
              .map((d, i) => `[${i}] (${d.draft.platform})\n${d.draft.text}`)
              .join("\n\n") +
            `\n\n### Sources ${displayName("radar")} verified this run\n` +
            radarCitations.map((c) => `- ${c.title}: ${c.url}`).join("\n"),
          maxTokens: 2500,
        },
        SentinelContentAudit,
      );
      await convex().mutation(api.orchestra.attachArtifact, {
        taskId: auditTaskId as never,
        runDate,
        role: "sentinel",
        kind: "verdict",
        honestStatus: audit.data.status,
        summary: audit.data.summary,
        body: audit.data.drafts
          .map((d) => `[${d.index}] ${d.verdict}${d.issues.length ? ` — ${d.issues.join("; ")}` : ""}`)
          .join("\n"),
        citations: [],
        missing: audit.data.missing,
        uncertainties: audit.data.uncertainties,
        model: MODEL_LEAD,
        tokensIn: audit.usage.input_tokens ?? 0,
        tokensOut: audit.usage.output_tokens ?? 0,
        costUsd: 0,
      });
      for (const inc of audit.data.incidents) {
        await convex().mutation(api.orchestra.insertIncident, {
          runDate,
          role: "quill",
          kind: inc.kind,
          severity: inc.severity,
          detail: inc.detail,
        });
      }
      await convex().mutation(api.orchestra.recordVerdict, {
        taskId: compassTaskId as never,
        verdict: audit.data.memoVerdict,
        verificationNotes: audit.data.summary,
        onFail: "escalated",
      });
      for (const [i, d] of drafts.entries()) {
        const dv = audit.data.drafts.find((x) => x.index === i);
        const verdictForDraft = dv?.verdict ?? "needs_work";
        await convex().mutation(api.orchestra.recordVerdict, {
          taskId: d.taskId as never,
          verdict: verdictForDraft,
          verificationNotes: dv?.issues.join("; ") || "confirmed",
          onFail: "escalated",
        });
        if (verdictForDraft === "confirmed") {
          await convex().mutation(api.orchestra.insertPost, {
            runDate,
            platform: d.draft.platform,
            angle: `${d.angle.angle} — ${d.angle.why}`,
            text: d.draft.text,
            citations: d.angle.sourceUrls.map((u) => ({ title: u, url: u })),
          });
          draftsQueued += 1;
        }
      }
    }
  }
  // ---- 3.7 Outreach lane (Phase 3): Herald researches, Sentinel audits ---
  // Kill rule: any HIGH-severity herald incident in the last 7 days pauses
  // the lane automatically until the week rolls over (post-mortem window).
  let heraldQueued = 0;
  let heraldNote = "";
  const heraldMax = Math.min(
    Number(process.env.ORCHESTRA_HERALD_MAX ?? "3") || 3,
    10,
  );
  const recentIncidents = await convex().query(
    api.orchestra.recentIncidents,
    {},
  );
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const heraldKilled = recentIncidents.some(
    (i) => i.role === "herald" && i.severity === "high" && i.runDate >= weekAgo,
  );
  if (heraldKilled) {
    heraldNote = `${displayName("herald")} PAUSED — high-severity incident on file this week (kill rule). Fix the charter, then it auto-resumes.`;
  } else {
    const candidates = await convex().query(api.orchestra.heraldCandidates, {
      limit: heraldMax,
    });
    if (candidates.length === 0) {
      heraldNote = `${displayName("herald")} idle — no eligible contacts (need: email on file, never contacted). Import connections or reveal emails in Reach.`;
    } else {
      const memory = await memoryBlock();
      const heraldDrafts: {
        taskId: string;
        candidate: (typeof candidates)[number];
        draft: HeraldDraft;
      }[] = [];
      for (const cand of candidates) {
        const heraldTaskId: string = await convex().mutation(
          api.orchestra.createTask,
          {
            runDate,
            role: "herald",
            objective: `Research ${cand.name}${cand.companyName ? ` (${cand.companyName})` : ""} and draft one reply-worthy email.`,
            definitionOfDone: [
              "Every personalization claim in the claims table with a URL seen this run",
              "≤120 words, one specific reason, one low-pressure ask",
              "Blocked is the right answer if nothing credible was found",
            ],
            boundaries: [
              "No sending, no credits, no contacting anyone",
              "Email lands in the queue for the CEO's review only",
            ],
            budgets: { maxOutputTokens: 2500, maxToolCalls: 3, maxUsd: 0.6 },
          },
        );
        inFlightTaskId = heraldTaskId;
        await convex().mutation(api.orchestra.setTaskStatus, {
          taskId: heraldTaskId as never,
          status: "in_progress",
          bumpAttempts: true,
        });
        const herald = await callWithEnvelope<HeraldDraft>(
          {
            runDate,
            role: "herald",
            taskId: heraldTaskId,
            model: MODEL_WORKER,
            system: buildSystem(HERALD_CHARTER),
            user:
              `${memory}\n\n### The person\n` +
              `Name: ${cand.name}\nTitle: ${cand.title ?? "unknown"}\nCompany: ${cand.companyName ?? "unknown"}\n` +
              (cand.linkedin ? `LinkedIn: ${cand.linkedin}\n` : "") +
              (cand.summary ? `Known context: ${cand.summary}\n` : "") +
              (cand.notes ? `Your notes: ${cand.notes}\n` : "") +
              `\n### Shared affiliations (the reply trigger — cite these!)\n` +
              (cand.affiliations.length
                ? cand.affiliations
                    .map((a) => `- [strength ${a.strength}] ${a.kind}: ${a.detail}`)
                    .join("\n")
                : "(none on file — you need a sourced overlap instead)") +
              (cand.topJob
                ? `\n\n### Live opening at their company\n${cand.topJob.title} (match ${cand.topJob.matchScore})`
                : "") +
              `\n\nResearch (web search, ≤3 uses) and draft the email.`,
            maxTokens: 2500,
            webSearchUses: 3,
          },
          HeraldDraft,
        );
        if (herald.data.status === "blocked") {
          await convex().mutation(api.orchestra.setTaskStatus, {
            taskId: heraldTaskId as never,
            status: "blocked",
            statusReason: herald.data.summary,
          });
          continue;
        }
        await convex().mutation(api.orchestra.attachArtifact, {
          taskId: heraldTaskId as never,
          runDate,
          role: "herald",
          kind: "draft",
          honestStatus: herald.data.status,
          summary: herald.data.summary,
          body: `Subject: ${herald.data.subject}\n\n${herald.data.body}\n\nClaims:\n${herald.data.claims.map((c) => `- ${c.claim} → ${c.sourceUrl}`).join("\n")}`,
          citations: herald.data.claims.map((c) => ({
            title: c.claim.slice(0, 80),
            url: c.sourceUrl,
          })),
          missing: herald.data.missing,
          uncertainties: herald.data.uncertainties,
          model: MODEL_WORKER,
          tokensIn: herald.usage.input_tokens ?? 0,
          tokensOut: herald.usage.output_tokens ?? 0,
          costUsd: 0,
        });
        heraldDrafts.push({ taskId: heraldTaskId, candidate: cand, draft: herald.data });
      }

      if (heraldDrafts.length > 0) {
        const auditTaskId: string = await convex().mutation(
          api.orchestra.createTask,
          {
            runDate,
            role: "sentinel",
            objective: `Audit ${heraldDrafts.length} outreach draft(s) — maximum strictness, real inboxes.`,
            definitionOfDone: [
              "Every email specific traced to the claims table and spot-checked",
            ],
            boundaries: ["Audit against sources and affiliation rows only"],
            budgets: { maxOutputTokens: 2500, maxToolCalls: 2, maxUsd: 1.5 },
          },
        );
        inFlightTaskId = auditTaskId;
        await convex().mutation(api.orchestra.setTaskStatus, {
          taskId: auditTaskId as never,
          status: "in_progress",
        });
        const audit = await callWithEnvelope<SentinelContentAudit>(
          {
            runDate,
            role: "sentinel",
            taskId: auditTaskId,
            model: MODEL_LEAD,
            system: buildSystem(
              SENTINEL_CHARTER + "\n\n" + SENTINEL_OUTREACH_ADDENDUM,
            ),
            user: heraldDrafts
              .map(
                (d, i) =>
                  `[${i}] To: ${d.candidate.name} (${d.candidate.companyName ?? "?"})\n` +
                  `Affiliation rows on file:\n` +
                  (d.candidate.affiliations.length
                    ? d.candidate.affiliations
                        .map((a) => `- ${a.kind}: ${a.detail}`)
                        .join("\n")
                    : "(none)") +
                  `\nSubject: ${d.draft.subject}\nEmail:\n${d.draft.body}\nClaims table:\n` +
                  d.draft.claims
                    .map((c) => `- ${c.claim} → ${c.sourceUrl}`)
                    .join("\n"),
              )
              .join("\n\n---\n\n"),
            maxTokens: 2500,
            webSearchUses: 2,
          },
          SentinelContentAudit,
        );
        await convex().mutation(api.orchestra.attachArtifact, {
          taskId: auditTaskId as never,
          runDate,
          role: "sentinel",
          kind: "verdict",
          honestStatus: audit.data.status,
          summary: audit.data.summary,
          body: audit.data.drafts
            .map((d) => `[${d.index}] ${d.verdict}${d.issues.length ? ` — ${d.issues.join("; ")}` : ""}`)
            .join("\n"),
          citations: [],
          missing: audit.data.missing,
          uncertainties: audit.data.uncertainties,
          model: MODEL_LEAD,
          tokensIn: audit.usage.input_tokens ?? 0,
          tokensOut: audit.usage.output_tokens ?? 0,
          costUsd: 0,
        });
        for (const inc of audit.data.incidents) {
          await convex().mutation(api.orchestra.insertIncident, {
            runDate,
            role: "herald",
            kind: inc.kind,
            severity: inc.severity,
            detail: inc.detail,
          });
        }
        for (const [i, d] of heraldDrafts.entries()) {
          const dv = audit.data.drafts.find((x) => x.index === i);
          const verdictForDraft = dv?.verdict ?? "needs_work";
          await convex().mutation(api.orchestra.recordVerdict, {
            taskId: d.taskId as never,
            verdict: verdictForDraft,
            verificationNotes: dv?.issues.join("; ") || "confirmed",
            onFail: "escalated",
          });
          if (verdictForDraft === "confirmed") {
            await convex().mutation(api.outreach.insert, {
              doc: {
                contactId: d.candidate.id,
                ...(d.candidate.topJob ? { jobId: d.candidate.topJob.id } : {}),
                channel: "email",
                subject: d.draft.subject,
                draft: d.draft.body,
                aiDraft: d.draft.body,
                touchNumber: 1,
                createdAt: new Date().toISOString(),
              },
            });
            heraldQueued += 1;
          }
        }
      }
      heraldNote = `${displayName("herald")}: ${heraldQueued} audited draft(s) → /outreach queue (${candidates.length} candidates considered).`;
    }
  }
  inFlightTaskId = null;

  // ---- 4. Report (assembled by code — no LLM cost) -----------------------
  const spend = await convex().query(api.orchestra.spendForDate, { runDate });
  const boardToday = await convex().query(api.orchestra.tasksForRun, { runDate });
  const stats = {
    tasksTotal: boardToday.length,
    verified: boardToday.filter((t) => t.status === "verified").length,
    rejected: boardToday.filter((t) => t.verdict === "refuted").length,
    blocked: boardToday.filter((t) => t.status === "blocked").length,
    escalated: boardToday.filter((t) => t.status === "escalated").length,
    costUsd: Math.round(spend.costUsd * 100) / 100,
  };
  const lines: string[] = [];
  lines.push(
    `ORCHESTRA — ${fmtDate(runDate)} · generated ${fmtTime(new Date().toISOString())}`,
  );
  lines.push(
    confirmed
      ? `${displayName("radar")}'s brief: VERIFIED by ${displayName("sentinel")}.`
      : `${displayName("radar")}'s brief: ${verdict?.verdict ?? "no verdict"} — ESCALATED to you (see notes).`,
  );
  if (compassNote) lines.push(`${displayName("compass")}: ${compassNote}`);
  if (draftsQueued > 0) {
    lines.push(
      `>>> ${draftsQueued} draft(s) awaiting YOUR approval on /company <<<`,
    );
  }
  if (heraldNote) lines.push(heraldNote);
  if (!vigil.firstRun && vigil.changes.length) {
    lines.push(
      `${displayName("vigil")}: ${vigil.changes.length} platform change(s) noticed — ${vigil.changes.join("; ")}`,
    );
  }
  if (heraldQueued > 0) {
    lines.push(`>>> ${heraldQueued} outreach email(s) awaiting YOUR review on /outreach <<<`);
  }
  lines.push("");
  lines.push(radarBody || "(no brief produced)");
  if (verdict && !confirmed) {
    lines.push("");
    lines.push(`${displayName("sentinel")}'s objection: ${verdict.summary}`);
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
