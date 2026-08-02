// The weekly retro (final plan Phase 5): Atlas reviews its own company's week
// and files charter-change PROPOSALS with evidence. Only the CEO merges —
// approved proposals become eng requests (Forge specs the charter edit,
// Mason applies it, Probe reviews), so even self-improvement flows through
// the accountability spine.
import { getClient } from "@/lib/claude/client";
import { api, convex } from "@/lib/convex/server";
import {
  ATLAS_CHARTER,
  ATLAS_RETRO_ADDENDUM,
  buildSystem,
} from "@/lib/orchestra/charters";
import { guardBudget, recordSpend, type Usage } from "@/lib/orchestra/ledger";
import { getMemory } from "@/lib/orchestra/memory";
import { resolveTier } from "@/lib/orchestra/tiers";
import { extractEnvelope, RetroReport, todayDate } from "@/lib/orchestra/types";

export async function runRetro(): Promise<{ done: boolean; message: string }> {
  const runDate = todayDate();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // Idempotent per week: skip if a retro artifact exists in the last 6 days.
  const lastRetro = await convex().query(api.orchestra.latestArtifactOfKind, {
    kind: "retro",
  });
  if (lastRetro && lastRetro.runDate > weekAgo) {
    return {
      done: false,
      message: `Retro already ran this week (${lastRetro.runDate}).`,
    };
  }

  const [scorecard, incidents, tasks, lessons, spendToday] = await Promise.all([
    convex().query(api.orchestra.scorecard, { sinceDate: weekAgo }),
    convex().query(api.orchestra.recentIncidents, {}),
    convex().query(api.orchestra.recentTasks, { limit: 100 }),
    getMemory("lessons"),
    convex().query(api.orchestra.spendForDate, { runDate }),
  ]);
  const weekIncidents = incidents.filter((i) => i.runDate >= weekAgo);
  const escalated = tasks.filter(
    (t) => t.runDate >= weekAgo && t.status === "escalated",
  );

  const tier = await resolveTier();
  const retroTaskId: string = await convex().mutation(api.orchestra.createTask, {
    runDate,
    role: "atlas",
    objective: "Weekly retro: review the company's week, propose evidenced changes.",
    definitionOfDone: [
      "Every proposal cites a concrete incident/lesson/scorecard row",
      "Zero proposals is explicit, not implicit",
    ],
    boundaries: ["Propose only — the CEO merges charter changes"],
    budgets: { maxOutputTokens: 2500, maxToolCalls: 0, maxUsd: 1 },
  });
  await convex().mutation(api.orchestra.setTaskStatus, {
    taskId: retroTaskId as never,
    status: "in_progress",
    bumpAttempts: true,
  });

  await guardBudget(runDate);
  const client = await getClient();
  const resp = await client.messages.create({
    model: tier.models.lead,
    max_tokens: 2500,
    system: buildSystem(ATLAS_CHARTER + "\n\n" + ATLAS_RETRO_ADDENDUM) as never,
    messages: [
      {
        role: "user",
        content:
          `### Scorecard since ${weekAgo}\n` +
          JSON.stringify(scorecard, null, 1) +
          `\n\n### Incidents this week (${weekIncidents.length})\n` +
          (weekIncidents
            .map((i) => `- [${i.severity}] ${i.role}/${i.kind}: ${i.detail}`)
            .join("\n") || "(none)") +
          `\n\n### Escalations this week (${escalated.length})\n` +
          (escalated
            .map((t) => `- ${t.role}: ${t.objective.slice(0, 100)} — ${t.verificationNotes ?? t.statusReason ?? ""}`)
            .join("\n") || "(none)") +
          `\n\n### Lessons file (CEO rejections)\n${lessons}` +
          `\n\n### Active tier: ${tier.id}. Today's spend so far: $${spendToday.costUsd.toFixed(2)}.` +
          `\n\nRun the retro.`,
      },
    ],
  });
  const usage = resp.usage as unknown as Usage;
  await recordSpend({
    runDate,
    role: "atlas",
    taskId: retroTaskId,
    model: tier.models.lead,
    usage,
  });
  const text = (resp.content as unknown as { type: string; text?: string }[])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  const parsed = extractEnvelope<RetroReport>(text, RetroReport);
  if (!parsed.ok) {
    await convex().mutation(api.orchestra.setTaskStatus, {
      taskId: retroTaskId as never,
      status: "failed",
      statusReason: `Retro envelope invalid: ${parsed.error.slice(0, 300)}`,
    });
    return { done: false, message: `Retro failed validation: ${parsed.error}` };
  }

  // Body: human-readable memo + a machine-readable proposals block the UI
  // parses to offer "file as eng request" buttons.
  const body =
    `## Health\n${parsed.data.healthSummary}\n\n` +
    `## Wins\n${parsed.data.wins.map((w) => `- ${w}`).join("\n") || "-"}\n\n` +
    `## Concerns\n${parsed.data.concerns.map((c) => `- ${c}`).join("\n") || "-"}\n\n` +
    `## Proposals (${parsed.data.proposals.length}) — yours to merge or ignore\n` +
    (parsed.data.proposals
      .map(
        (pr, i) =>
          `${i + 1}. **${pr.target}** — ${pr.change}\n   Evidence: ${pr.evidence}\n   Expected: ${pr.expectedEffect}`,
      )
      .join("\n") || "(none — a clean week)") +
    `\n\n\`\`\`json\n${JSON.stringify({ proposals: parsed.data.proposals })}\n\`\`\``;

  await convex().mutation(api.orchestra.attachArtifact, {
    taskId: retroTaskId as never,
    runDate,
    role: "atlas",
    kind: "retro",
    honestStatus: parsed.data.status,
    summary: parsed.data.summary,
    body,
    citations: [],
    missing: parsed.data.missing,
    uncertainties: parsed.data.uncertainties,
    model: tier.models.lead,
    tokensIn: usage.input_tokens ?? 0,
    tokensOut: usage.output_tokens ?? 0,
    costUsd: 0,
  });
  return {
    done: true,
    message:
      `Retro filed: ${parsed.data.summary}\n` +
      `${parsed.data.proposals.length} proposal(s) on /company — merge or ignore, your call.`,
  };
}
