// Pulse's strategy review — the loop that makes the next campaign better than
// the last one.
//
// Inputs are all facts the company already holds: what shipped, what the CEO
// typed in as performance, what he rejected and why, and the current memory.
// Output is a memo plus PROPOSED memory edits. Nothing is applied here — the
// CEO applies proposals from the Studio, one at a time, which is the same rule
// the retro follows for charters (locked decision #9 of the final plan).
import { api, convex } from "@/lib/convex/server";
import { callWithEnvelope } from "@/lib/orchestra/callcore";
import { buildSystem, PULSE_CHARTER } from "@/lib/orchestra/charters";
import {
  appendLesson,
  campaignMemoryBlock,
  getBannedData,
  getVoiceData,
  saveMemoryData,
} from "@/lib/orchestra/memory";
import { resolveTier } from "@/lib/orchestra/tiers";
import { StrategyReport, todayDate } from "@/lib/orchestra/types";

export type StrategyProposal = {
  target: "voiceDos" | "voiceDonts" | "bannedTopics" | "lessons" | "pillars";
  change: string;
  evidence: string;
};

function engagement(m: {
  impressions?: number;
  reactions?: number;
  comments?: number;
  reposts?: number;
} | null): number | null {
  if (!m) return null;
  const acts = (m.reactions ?? 0) + (m.comments ?? 0) * 3 + (m.reposts ?? 0) * 5;
  if (!m.impressions) return acts || null;
  return Math.round((acts / m.impressions) * 10000) / 100; // % engagement
}

export type StrategyRunResult = {
  done: boolean;
  message: string;
  memo?: string;
  proposals?: StrategyProposal[];
};

export async function runStrategyReview(): Promise<StrategyRunResult> {
  const runDate = todayDate();
  const tier = await resolveTier();
  const [posted, rejected, campaigns, memory] = await Promise.all([
    convex().query(api.orchestra.postsForAnalysis, { limit: 40 }),
    convex().query(api.orchestra.rejectedPosts, { limit: 20 }),
    convex().query(api.campaigns.list, { limit: 10 }),
    campaignMemoryBlock(),
  ]);

  if (posted.length === 0 && rejected.length === 0) {
    return {
      done: false,
      message:
        "Nothing to review yet — publish a post (and log its numbers) or reject a draft first.",
    };
  }

  const withMetrics = posted.filter((p) => p.metrics);
  const taskId: string = await convex().mutation(api.orchestra.createTask, {
    runDate,
    role: "pulse",
    objective: `Review ${posted.length} published post(s) and ${rejected.length} rejection(s); propose memory edits.`,
    definitionOfDone: [
      "Pillar counts come from the data, not from estimation",
      "Audience claims rest on captured metrics, or say 'insufficient data'",
      "Every proposal names its evidence",
    ],
    boundaries: [
      "Propose only — memory edits are applied by the CEO",
      "No drafting, no posting",
    ],
    budgets: { maxOutputTokens: 4000, maxToolCalls: 0, maxUsd: 1 },
  });
  await convex().mutation(api.orchestra.setTaskStatus, {
    taskId: taskId as never,
    status: "in_progress",
    bumpAttempts: true,
  });

  try {
    const report = await callWithEnvelope<StrategyReport>(
      {
        runDate,
        role: "pulse",
        taskId,
        model: tier.models.grunt,
        system: buildSystem(PULSE_CHARTER),
        user:
          `${memory}\n\n### Published posts (${posted.length}; ${withMetrics.length} with metrics)\n` +
          posted
            .map((p) => {
              const e = engagement(p.metrics);
              return (
                `- [${p.postedAt.slice(0, 10)}] ${p.platform} · pillar: ${p.pillar ?? "unknown"} · format: ${p.format ?? "unknown"} · hook: ${p.hookType ?? "unknown"}\n` +
                `  topic: ${p.topicTitle ?? p.angle}\n` +
                `  metrics: ${
                  p.metrics
                    ? `impressions ${p.metrics.impressions ?? "?"} · reactions ${p.metrics.reactions ?? "?"} · comments ${p.metrics.comments ?? "?"} · reposts ${p.metrics.reposts ?? "?"}${e !== null ? ` · engagement ${e}` : ""}${p.metrics.note ? ` · note: ${p.metrics.note}` : ""}`
                    : "NOT CAPTURED"
                }\n` +
                `  opening line: ${p.text.split("\n")[0].slice(0, 140)}`
              );
            })
            .join("\n") +
          `\n\n### Rejections (what he refused, in his words)\n` +
          (rejected.length
            ? rejected
                .map((r) => `- [${r.decidedAt.slice(0, 10)}] ${r.angle.slice(0, 80)} → "${r.reason}"`)
                .join("\n")
            : "(none)") +
          `\n\n### Campaign history\n` +
          (campaigns.length
            ? campaigns
                .map(
                  (c) =>
                    `- ${c.runDate} "${c.title}": ${c.topics} topics scouted, ${c.drafts} drafted, ${c.approved} approved ($${c.costUsd.toFixed(2)})`,
                )
                .join("\n")
            : "(none)") +
          `\n\nWrite the review.`,
        maxTokens: 4000,
      },
      StrategyReport,
    );

    await convex().mutation(api.orchestra.attachArtifact, {
      taskId: taskId as never,
      runDate,
      role: "pulse",
      kind: "strategy",
      honestStatus: report.data.status,
      summary: report.data.summary,
      body:
        (report.body || "") +
        `\n\n\`\`\`json\n${JSON.stringify({ proposals: report.data.kbUpdates }, null, 2)}\n\`\`\``,
      citations: [],
      missing: report.data.missing,
      uncertainties: report.data.uncertainties,
      model: tier.models.grunt,
      tokensIn: report.usage.input_tokens ?? 0,
      tokensOut: report.usage.output_tokens ?? 0,
      costUsd: report.costUsd,
    });
    await convex().mutation(api.orchestra.recordVerdict, {
      taskId: taskId as never,
      verdict: "confirmed",
      verificationNotes: report.data.summary,
    });

    return {
      done: true,
      message: `Review done — ${report.data.recommendations.length} recommendation(s), ${report.data.kbUpdates.length} proposed memory edit(s).`,
      memo: report.body,
      proposals: report.data.kbUpdates,
    };
  } catch (err) {
    await convex().mutation(api.orchestra.setTaskStatus, {
      taskId: taskId as never,
      status: "failed",
      statusReason: (err instanceof Error ? err.message : String(err)).slice(0, 400),
    });
    throw err;
  }
}

// Apply ONE proposal, on the CEO's tap. Additive by design: a proposal can add
// a line to the memory, never rewrite or delete what's already there — an
// agent-proposed edit should not be able to quietly erase a rule the CEO set.
export async function applyStrategyProposal(
  p: StrategyProposal,
): Promise<string> {
  const change = p.change.trim();
  if (!change) throw new Error("Empty proposal.");
  switch (p.target) {
    case "lessons":
      await appendLesson(change);
      return "Filed to lessons.";
    case "bannedTopics": {
      const banned = await getBannedData();
      if (banned.topics.some((t) => t.toLowerCase() === change.toLowerCase())) {
        return "Already on the banned list.";
      }
      banned.topics.push(change);
      await saveMemoryData("bannedTopics", banned);
      return "Added to banned topics.";
    }
    default: {
      const voice = await getVoiceData();
      const list =
        p.target === "voiceDos"
          ? voice.dos
          : p.target === "voiceDonts"
            ? voice.donts
            : voice.pillars;
      if (list.some((x) => x.toLowerCase() === change.toLowerCase())) {
        return "Already in the brand voice.";
      }
      list.push(change);
      await saveMemoryData("brandVoice", voice);
      return p.target === "pillars"
        ? "Added as a content pillar."
        : "Added to the brand voice.";
    }
  }
}
