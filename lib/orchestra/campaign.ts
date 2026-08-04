// The Studio campaign engine — the GTM team's human-in-the-loop content
// pipeline, run entirely from /company/studio.
//
// Shape (three model stages, three human checkpoints):
//
//   [scout]        Radar scans → Compass ranks          → CHECKPOINT: pick topics
//   [deep]         Delve researches (parallel) →
//                  Spark writes hooks (one batched call) → CHECKPOINT: pick hooks
//   [draft]        Quill drafts (parallel) →
//                  Hone polishes (batched) →
//                  Sentinel audits (batched)             → CHECKPOINT: approve/revise/skip
//
// Efficiency is structural, not incidental:
//   - per-topic work fans out with Promise.all (wall-clock = slowest topic)
//   - cross-topic work (hooks, polish, audit) is ONE call, not one per topic
//   - each call carries only what its stage needs, so contexts stay small and
//     the cached charter prefix does the heavy lifting
//   - stage functions are compare-and-swap guarded in Convex, so a double
//     click or a reloaded tab can never run a stage twice
//
// Everything a stage produces is written to Convex before the stage returns.
// A crash loses the stage, never the campaign.
import { api, convex } from "@/lib/convex/server";
import { callWithEnvelope } from "@/lib/orchestra/callcore";
import {
  buildSystem,
  COMPASS_RANK_CHARTER,
  DELVE_CHARTER,
  HONE_CHARTER,
  QUILL_CAMPAIGN_ADDENDUM,
  QUILL_CHARTER,
  RADAR_TOPICS_CHARTER,
  SENTINEL_CHARTER,
  SENTINEL_CONTENT_ADDENDUM,
  SPARK_CHARTER,
} from "@/lib/orchestra/charters";
import { campaignMemoryBlock, getVoiceData } from "@/lib/orchestra/memory";
import { displayName } from "@/lib/orchestra/registry";
import { resolveTier } from "@/lib/orchestra/tiers";
import {
  type Citation,
  HookBatch,
  PolishBatch,
  PostDraft,
  RankedTopics,
  SentinelContentAudit,
  TopicBrief,
  TopicScan,
} from "@/lib/orchestra/types";

type Campaign = NonNullable<
  Awaited<ReturnType<typeof loadCampaign>>
>;

async function loadCampaign(campaignId: string) {
  return await convex().query(api.campaigns.get, {
    campaignId: campaignId as never,
  });
}

// Every stage bills the campaign as it goes, so a run that dies halfway still
// shows what it cost. The daily cap is enforced upstream in the ledger.
async function bill(campaignId: string, costUsd: number): Promise<void> {
  if (costUsd <= 0) return;
  await convex().mutation(api.campaigns.addCost, {
    campaignId: campaignId as never,
    costUsd,
  });
}

// A board contract, so campaign work shows up on /company and in the scorecard
// exactly like the daily run's work does.
async function contract(args: {
  runDate: string;
  role: string;
  objective: string;
  definitionOfDone: string[];
  boundaries: string[];
  maxOutputTokens: number;
  maxToolCalls: number;
  maxUsd: number;
}): Promise<string> {
  const taskId: string = await convex().mutation(api.orchestra.createTask, {
    runDate: args.runDate,
    role: args.role,
    objective: args.objective,
    definitionOfDone: args.definitionOfDone,
    boundaries: args.boundaries,
    budgets: {
      maxOutputTokens: args.maxOutputTokens,
      maxToolCalls: args.maxToolCalls,
      maxUsd: args.maxUsd,
    },
  });
  await convex().mutation(api.orchestra.setTaskStatus, {
    taskId: taskId as never,
    status: "in_progress",
    bumpAttempts: true,
  });
  return taskId;
}

async function deliver(args: {
  taskId: string;
  runDate: string;
  role: string;
  kind: string;
  honestStatus: string;
  summary: string;
  body: string;
  citations?: Citation[];
  missing?: string[];
  uncertainties?: string[];
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}): Promise<void> {
  await convex().mutation(api.orchestra.attachArtifact, {
    taskId: args.taskId as never,
    runDate: args.runDate,
    role: args.role,
    kind: args.kind,
    honestStatus: args.honestStatus,
    summary: args.summary,
    body: args.body,
    citations: args.citations ?? [],
    missing: args.missing ?? [],
    uncertainties: args.uncertainties ?? [],
    model: args.model,
    tokensIn: args.tokensIn,
    tokensOut: args.tokensOut,
    costUsd: args.costUsd,
  });
}

// Studio work is checked by the human at three checkpoints, so most stages
// close their contract themselves rather than routing through Sentinel. The
// drafts stage is the exception — it gets a real audit, because that's the one
// whose output leaves the building.
async function selfClose(taskId: string, note: string): Promise<void> {
  await convex().mutation(api.orchestra.recordVerdict, {
    taskId: taskId as never,
    verdict: "confirmed",
    verificationNotes: note,
  });
}

function slug(title: string, i: number): string {
  return `${i}-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}`;
}

// ---------------------------------------------------------------------------
// Stage 1 — scout: Radar scans the week, Compass ranks the shortlist.
// ---------------------------------------------------------------------------
export async function runScoutStage(campaignId: string): Promise<void> {
  const c = await loadCampaign(campaignId);
  if (!c) throw new Error("Campaign not found.");
  const tier = await resolveTier();
  const voice = await getVoiceData();
  const memory = await campaignMemoryBlock();
  const runDate = c.runDate;

  const pillars = voice.pillars.length
    ? voice.pillars.join(" · ")
    : c.focus || "(no pillars set — use the focus line only)";

  const scanTask = await contract({
    runDate,
    role: "radar",
    objective: `Scout ${c.targetPosts * 2}+ topic candidates for the "${c.title}" campaign.`,
    definitionOfDone: [
      "10-14 candidates, each with a source URL opened this run",
      "Each candidate tagged with a pillar that exists and a format",
      "Hot-topic and brand-case-study coverage, or an explicit note of why not",
    ],
    boundaries: ["Research only — no ranking, no drafting, no posting"],
    maxOutputTokens: 6000,
    maxToolCalls: 6,
    maxUsd: 1.5,
  });

  const scan = await callWithEnvelope<TopicScan>(
    {
      runDate,
      role: "radar",
      taskId: scanTask,
      model: tier.models.worker,
      system: buildSystem(RADAR_TOPICS_CHARTER),
      user:
        `${memory}\n\n### Campaign\nTitle: ${c.title}\nPillars: ${pillars}\n` +
        (c.focus ? `Focus this week: ${c.focus}\n` : "") +
        `Platform: ${c.platform}\nToday: ${runDate}\n\n` +
        (c.seedIdeas.length
          ? `### The CEO's own ideas (do NOT research these into oblivion — they are already committed; just note if one of your findings overlaps)\n${c.seedIdeas
              .map((i) => `- ${i}`)
              .join("\n")}\n\n`
          : "") +
        `Scout this week's candidates.`,
      maxTokens: 6000,
      webSearchUses: 6,
    },
    TopicScan,
  );
  await bill(campaignId, scan.costUsd);
  await deliver({
    taskId: scanTask,
    runDate,
    role: "radar",
    kind: "scan",
    honestStatus: scan.data.status,
    summary: scan.data.summary,
    body: scan.data.topics
      .map((t) => `### ${t.title} (${t.format} · ${t.pillar})\n${t.whyTrending}\nAngle: ${t.angle}`)
      .join("\n\n"),
    citations: scan.citations,
    missing: scan.data.missing,
    uncertainties: scan.data.uncertainties,
    model: tier.models.worker,
    tokensIn: scan.usage.input_tokens ?? 0,
    tokensOut: scan.usage.output_tokens ?? 0,
    costUsd: scan.costUsd,
  });
  await selfClose(scanTask, `${scan.data.topics.length} candidates scouted.`);

  // ---- Compass merges the CEO's ideas in and ranks -------------------------
  const shortlist = Math.max(c.targetPosts * 2, 6);
  const rankTask = await contract({
    runDate,
    role: "compass",
    objective: `Rank a shortlist of ${shortlist} topics for "${c.title}".`,
    definitionOfDone: [
      "Every one of the CEO's ideas present, in his exact words",
      "Each entry has a concrete angle naming what to anchor the post to",
      "Format quota honoured when the scout surfaced those formats",
    ],
    boundaries: ["Rank only — no research, no drafting"],
    maxOutputTokens: 4000,
    maxToolCalls: 0,
    maxUsd: 1,
  });
  const ranked = await callWithEnvelope<RankedTopics>(
    {
      runDate,
      role: "compass",
      taskId: rankTask,
      model: tier.models.lead,
      system: buildSystem(COMPASS_RANK_CHARTER),
      user:
        `${memory}\n\n### The CEO's ideas (verbatim — keep his wording)\n` +
        (c.seedIdeas.length
          ? c.seedIdeas.map((i) => `- ${i}`).join("\n")
          : "(none this week — rank the research candidates alone)") +
        `\n\n### ${displayName("radar")}'s candidates\n` +
        scan.data.topics
          .map(
            (t, i) =>
              `[${i}] ${t.title}\n  format: ${t.format} · pillar: ${t.pillar}\n  why now: ${t.whyTrending}\n  angle: ${t.angle}\n  sources: ${t.sourceUrls.join(", ") || "(none)"}`,
          )
          .join("\n") +
        `\n\nReturn exactly ${shortlist} ranked topics (fewer only if there genuinely aren't that many worth writing).`,
      maxTokens: 4000,
    },
    RankedTopics,
  );
  await bill(campaignId, ranked.costUsd);
  await deliver({
    taskId: rankTask,
    runDate,
    role: "compass",
    kind: "shortlist",
    honestStatus: ranked.data.status,
    summary: ranked.data.summary,
    body: ranked.data.ranked
      .map((t) => `**#${t.rank} ${t.title}** (${t.source} · ${t.pillar} · ${t.format})\n${t.angle}\nWhy now: ${t.whyNow}`)
      .join("\n\n"),
    missing: ranked.data.missing,
    uncertainties: ranked.data.uncertainties,
    model: tier.models.lead,
    tokensIn: ranked.usage.input_tokens ?? 0,
    tokensOut: ranked.usage.output_tokens ?? 0,
    costUsd: ranked.costUsd,
  });
  await selfClose(rankTask, `${ranked.data.ranked.length} topics shortlisted.`);

  // Radar's sources are the only citations that exist at this point; attach
  // the ones matching each topic so the brief stage starts grounded.
  const sorted = [...ranked.data.ranked].sort((a, b) => a.rank - b.rank);
  await convex().mutation(api.campaigns.setTopics, {
    campaignId: campaignId as never,
    topics: sorted.map((t, i) => ({
      id: slug(t.title, i),
      rank: t.rank,
      title: t.title,
      source: t.source,
      pillar: t.pillar,
      format: t.format,
      angle: t.angle,
      whyNow: t.whyNow,
    })),
  });
}

// ---------------------------------------------------------------------------
// Stage 2 — deep research (fan-out) + hooks (one batched call).
// ---------------------------------------------------------------------------
export async function runDeepResearchStage(campaignId: string): Promise<void> {
  const c = await loadCampaign(campaignId);
  if (!c) throw new Error("Campaign not found.");
  const tier = await resolveTier();
  const memory = await campaignMemoryBlock();
  const runDate = c.runDate;
  const picked = c.topics.filter((t) => c.selectedTopicIds.includes(t.id));
  if (!picked.length) throw new Error("No topics selected.");

  // One researcher per topic, all at once. Each carries only its own topic —
  // small contexts, and the campaign waits on the slowest, not the sum.
  const results = await Promise.all(
    picked.map(async (topic) => {
      const taskId = await contract({
        runDate,
        role: "delve",
        objective: `Research "${topic.title}" for the ${topic.pillar} post.`,
        definitionOfDone: [
          "Every stat carries the source that states it",
          "At least one specific, named, recent example — or an honest 'blocked'",
        ],
        boundaries: ["Research only — no drafting, no hooks"],
        maxOutputTokens: 3000,
        maxToolCalls: 3,
        maxUsd: 0.6,
      });
      try {
        const brief = await callWithEnvelope<TopicBrief>(
          {
            runDate,
            role: "delve",
            taskId,
            model: tier.models.worker,
            system: buildSystem(DELVE_CHARTER),
            user:
              `### Topic\n${topic.title}\nPillar: ${topic.pillar}\nFormat: ${topic.format}\n` +
              `Intended angle: ${topic.angle}\nWhy now: ${topic.whyNow}\n\n` +
              `Research it (web search, ≤3 uses).`,
            maxTokens: 3000,
            webSearchUses: 3,
          },
          TopicBrief,
        );
        await bill(campaignId, brief.costUsd);
        await deliver({
          taskId,
          runDate,
          role: "delve",
          kind: "brief",
          honestStatus: brief.data.status,
          summary: brief.data.summary,
          body: brief.body || brief.data.summary,
          citations: brief.citations,
          missing: brief.data.missing,
          uncertainties: brief.data.uncertainties,
          model: tier.models.worker,
          tokensIn: brief.usage.input_tokens ?? 0,
          tokensOut: brief.usage.output_tokens ?? 0,
          costUsd: brief.costUsd,
        });
        await selfClose(taskId, brief.data.summary);
        return { topic, brief: brief.data, citations: brief.citations };
      } catch (err) {
        // One thin topic must not sink the campaign — it comes back empty and
        // the writer works from the angle alone.
        await convex().mutation(api.orchestra.setTaskStatus, {
          taskId: taskId as never,
          status: "failed",
          statusReason: (err instanceof Error ? err.message : String(err)).slice(0, 400),
        });
        return { topic, brief: null, citations: [] as Citation[] };
      }
    }),
  );

  // ---- Spark: five hooks per topic, ONE call for the whole campaign --------
  const hookTask = await contract({
    runDate,
    role: "spark",
    objective: `Write 5 hooks for each of ${picked.length} topic(s).`,
    definitionOfDone: [
      "Five distinct types per topic — not five phrasings of one line",
      "Every hook specific; no invented experience or number",
    ],
    boundaries: ["Hooks only — no bodies, no posting"],
    maxOutputTokens: 4000,
    maxToolCalls: 0,
    maxUsd: 0.8,
  });
  const hooks = await callWithEnvelope<HookBatch>(
    {
      runDate,
      role: "spark",
      taskId: hookTask,
      model: tier.models.worker,
      system: buildSystem(SPARK_CHARTER),
      user:
        `${memory}\n\n### Topics (use these indexes in \`sets\`)\n` +
        results
          .map(
            (r, i) =>
              `[${i}] ${r.topic.title}\n  angle: ${r.topic.angle}\n  format: ${r.topic.format}\n` +
              (r.brief
                ? `  stats: ${r.brief.keyStats.slice(0, 4).join(" | ") || "(none)"}\n` +
                  `  examples: ${r.brief.examples.slice(0, 3).join(" | ") || "(none)"}\n` +
                  `  hook candidates from research: ${r.brief.hookCandidates.slice(0, 3).join(" | ") || "(none)"}`
                : "  (no research brief — hooks must come from the angle and the story bank only)"),
          )
          .join("\n\n"),
      maxTokens: 4000,
    },
    HookBatch,
  );
  await bill(campaignId, hooks.costUsd);
  await deliver({
    taskId: hookTask,
    runDate,
    role: "spark",
    kind: "hooks",
    honestStatus: hooks.data.status,
    summary: hooks.data.summary,
    body: hooks.data.sets
      .map(
        (s) =>
          `### ${results[s.topicIndex]?.topic.title ?? `Topic ${s.topicIndex}`}\n` +
          s.hooks.map((h) => `- **${h.type}** — ${h.text}`).join("\n"),
      )
      .join("\n\n"),
    missing: hooks.data.missing,
    uncertainties: hooks.data.uncertainties,
    model: tier.models.worker,
    tokensIn: hooks.usage.input_tokens ?? 0,
    tokensOut: hooks.usage.output_tokens ?? 0,
    costUsd: hooks.costUsd,
  });
  await selfClose(hookTask, `${hooks.data.sets.length} hook set(s) written.`);

  await convex().mutation(api.campaigns.setBriefsAndHooks, {
    campaignId: campaignId as never,
    briefs: results.map((r) => ({
      topicId: r.topic.id,
      keyStats: r.brief?.keyStats ?? [],
      examples: r.brief?.examples ?? [],
      angles: r.brief?.angles ?? [],
      citations: r.citations.slice(0, 12),
      status: r.brief?.status ?? "blocked",
    })),
    hooks: results.map((r, i) => ({
      topicId: r.topic.id,
      options: hooks.data.sets.find((s) => s.topicIndex === i)?.hooks ?? [],
    })),
  });
}

// ---------------------------------------------------------------------------
// Stage 3 — draft (fan-out) → polish (batched) → audit (batched).
// ---------------------------------------------------------------------------
export async function runDraftStage(campaignId: string): Promise<void> {
  const c = await loadCampaign(campaignId);
  if (!c) throw new Error("Campaign not found.");
  const tier = await resolveTier();
  const memory = await campaignMemoryBlock();
  const runDate = c.runDate;
  const picked = c.topics.filter((t) => c.selectedTopicIds.includes(t.id));
  if (!picked.length) throw new Error("No topics selected.");

  const briefById = new Map(c.briefs.map((b) => [b.topicId, b]));
  const hooksById = new Map(c.hooks.map((h) => [h.topicId, h]));
  const platform = c.platform === "x" ? "x" : "linkedin";

  // Survivable failures collected as we go: a lost draft has to be VISIBLE,
  // not inferred from a count that doesn't match what was asked for.
  const notes: string[] = [];

  const drafted = await Promise.all(
    picked.map(async (topic) => {
      const brief = briefById.get(topic.id);
      const hookSet = hooksById.get(topic.id);
      const chosen =
        hookSet?.chosenIndex !== undefined
          ? hookSet.options[hookSet.chosenIndex]
          : undefined;
      const taskId = await contract({
        runDate,
        role: "quill",
        objective: `Draft the ${platform} post: ${topic.title.slice(0, 100)}`,
        definitionOfDone: [
          chosen
            ? "Chosen hook is line 1 verbatim, blank line after it"
            : "Own hook in one of the five styles, blank line after it",
          "Every specific traces to the research brief",
          platform === "x" ? "≤280 characters" : "150-250 words, ≤300",
        ],
        boundaries: ["Draft only — the CEO approves and posts"],
        maxOutputTokens: 2000,
        maxToolCalls: 0,
        maxUsd: 0.5,
      });
      try {
        const draft = await callWithEnvelope<PostDraft>(
          {
            runDate,
            role: "quill",
            taskId,
            model: tier.models.worker,
            system: buildSystem(
              `${QUILL_CHARTER}\n\n${QUILL_CAMPAIGN_ADDENDUM}`,
            ),
            user:
              `${memory}\n\n### The post\nPlatform: ${platform}\nTopic: ${topic.title}\n` +
              `Pillar: ${topic.pillar}\nFormat: ${topic.format}\nAngle to anchor to: ${topic.angle}\n` +
              `Why now: ${topic.whyNow}\n\n` +
              (chosen
                ? `### Your hook — LINE 1, VERBATIM (${chosen.type})\n${chosen.text}\n`
                : `### Hook\nNone chosen — write your own in one of the five styles.\n`) +
              `\n### Research brief\n` +
              (brief && brief.status !== "blocked"
                ? `Stats:\n${brief.keyStats.map((s) => `- ${s}`).join("\n") || "- (none)"}\n` +
                  `Examples:\n${brief.examples.map((s) => `- ${s}`).join("\n") || "- (none)"}\n` +
                  `Angles:\n${brief.angles.map((s) => `- ${s}`).join("\n") || "- (none)"}\n` +
                  `Sources you may reference:\n${brief.citations.map((s) => `- ${s.title}: ${s.url}`).join("\n") || "- (none)"}`
                : `(no usable brief — write from the angle and the story bank; make no factual claims about the outside world)`) +
              `\n\nWrite the post.`,
            maxTokens: 2000,
          },
          PostDraft,
        );
        await bill(campaignId, draft.costUsd);
        await deliver({
          taskId,
          runDate,
          role: "quill",
          kind: "draft",
          honestStatus: draft.data.status,
          summary: draft.data.summary,
          body: draft.data.text,
          citations: brief?.citations ?? [],
          missing: draft.data.missing,
          uncertainties: draft.data.uncertainties,
          model: tier.models.worker,
          tokensIn: draft.usage.input_tokens ?? 0,
          tokensOut: draft.usage.output_tokens ?? 0,
          costUsd: draft.costUsd,
        });
        return {
          topic,
          taskId,
          text: draft.data.text,
          hookType: chosen?.type ?? draft.data.hookType ?? "writer's choice",
          citations: brief?.citations ?? [],
        };
      } catch (err) {
        const why = (err instanceof Error ? err.message : String(err)).slice(0, 400);
        await convex().mutation(api.orchestra.setTaskStatus, {
          taskId: taskId as never,
          status: "failed",
          statusReason: why,
        });
        notes.push(`No draft for "${topic.title}" — ${why}`);
        return null;
      }
    }),
  );
  const drafts = drafted.filter((d): d is NonNullable<typeof d> => d !== null);
  if (!drafts.length) {
    throw new Error("Every draft failed — check the board for the reason.");
  }

  // ---- Hone: one polish pass over all drafts ------------------------------
  const honeTask = await contract({
    runDate,
    role: "hone",
    objective: `Polish ${drafts.length} draft(s) against the voice and format rules.`,
    definitionOfDone: [
      "Every draft checked against the full checklist",
      "No new facts, no added length, chosen hooks untouched",
      "Edits listed per draft",
    ],
    boundaries: ["Edit only — never change what a post claims"],
    maxOutputTokens: 6000,
    maxToolCalls: 0,
    maxUsd: 1,
  });
  let polished = drafts.map((d) => ({ text: d.text, edits: [] as string[] }));
  try {
    const polish = await callWithEnvelope<PolishBatch>(
      {
        runDate,
        role: "hone",
        taskId: honeTask,
        model: tier.models.worker,
        system: buildSystem(HONE_CHARTER),
        user:
          `${memory}\n\n### Drafts (return one entry per index)\n` +
          drafts
            .map(
              (d, i) =>
                `[${i}] platform: ${d.topic.format === "hot-topic" ? platform : platform} · pillar: ${d.topic.pillar} · hook type: ${d.hookType}\n${d.text}`,
            )
            .join("\n\n---\n\n"),
        maxTokens: 6000,
      },
      PolishBatch,
    );
    await bill(campaignId, polish.costUsd);
    polished = drafts.map((d, i) => {
      const p = polish.data.polished.find((x) => x.index === i);
      return { text: p?.text ?? d.text, edits: p?.edits ?? ["(not returned by the editor — original kept)"] };
    });
    await deliver({
      taskId: honeTask,
      runDate,
      role: "hone",
      kind: "polish",
      honestStatus: polish.data.status,
      summary: polish.data.summary,
      body: polish.data.polished
        .map((p) => `### [${p.index}] ${p.wordCount} words\n${p.edits.map((e) => `- ${e}`).join("\n") || "- no changes needed"}`)
        .join("\n\n"),
      missing: polish.data.missing,
      uncertainties: polish.data.uncertainties,
      model: tier.models.worker,
      tokensIn: polish.usage.input_tokens ?? 0,
      tokensOut: polish.usage.output_tokens ?? 0,
      costUsd: polish.costUsd,
    });
    await selfClose(honeTask, polish.data.summary);
  } catch (err) {
    // A failed polish is survivable: the unpolished drafts still go to the
    // CEO, clearly marked, rather than the campaign dying one step from done.
    const why = (err instanceof Error ? err.message : String(err)).slice(0, 400);
    await convex().mutation(api.orchestra.setTaskStatus, {
      taskId: honeTask as never,
      status: "failed",
      statusReason: why,
    });
    notes.push(`Style edit skipped — ${why}. These drafts are unpolished.`);
  }

  // ---- Sentinel: one audit over everything that could leave the building ---
  const auditTask = await contract({
    runDate,
    role: "sentinel",
    objective: `Audit ${drafts.length} campaign draft(s) before the approval queue.`,
    definitionOfDone: [
      "Every draft checked: claims vs sources, banned topics, voice, platform fit",
    ],
    boundaries: ["Audit against the memory files and the briefs, not taste"],
    maxOutputTokens: 3000,
    maxToolCalls: 0,
    maxUsd: 1.5,
  });
  let verdicts = new Map<number, { verdict: string; issues: string[] }>();
  try {
    const audit = await callWithEnvelope<SentinelContentAudit>(
      {
        runDate,
        role: "sentinel",
        taskId: auditTask,
        model: tier.models.lead,
        system: buildSystem(`${SENTINEL_CHARTER}\n\n${SENTINEL_CONTENT_ADDENDUM}`),
        user:
          `${memory}\n\n### Drafts\n` +
          polished
            .map((p, i) => `[${i}] topic: ${drafts[i].topic.title}\n${p.text}`)
            .join("\n\n---\n\n") +
          `\n\n### Sources the researchers actually saw\n` +
          drafts
            .map(
              (d, i) =>
                `[${i}] ${d.citations.map((cc) => `${cc.title}: ${cc.url}`).join(" | ") || "(none — this draft may carry no external factual claim)"}`,
            )
            .join("\n"),
        maxTokens: 3000,
      },
      SentinelContentAudit,
    );
    await bill(campaignId, audit.costUsd);
    verdicts = new Map(
      audit.data.drafts.map((d) => [d.index, { verdict: d.verdict, issues: d.issues }]),
    );
    await deliver({
      taskId: auditTask,
      runDate,
      role: "sentinel",
      kind: "verdict",
      honestStatus: audit.data.status,
      summary: audit.data.summary,
      body: audit.data.drafts
        .map((d) => `[${d.index}] ${d.verdict}${d.issues.length ? ` — ${d.issues.join("; ")}` : ""}`)
        .join("\n"),
      missing: audit.data.missing,
      uncertainties: audit.data.uncertainties,
      model: tier.models.lead,
      tokensIn: audit.usage.input_tokens ?? 0,
      tokensOut: audit.usage.output_tokens ?? 0,
      costUsd: audit.costUsd,
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
    await selfClose(auditTask, audit.data.summary);
    // Each writer's contract closes on the auditor's verdict, never its own.
    for (const [i, d] of drafts.entries()) {
      const v = verdicts.get(i);
      await convex().mutation(api.orchestra.recordVerdict, {
        taskId: d.taskId as never,
        verdict: (v?.verdict ?? "needs_work") as never,
        verificationNotes: v?.issues.join("; ") || "confirmed",
        onFail: "escalated",
      });
    }
  } catch (err) {
    const why = (err instanceof Error ? err.message : String(err)).slice(0, 400);
    await convex().mutation(api.orchestra.setTaskStatus, {
      taskId: auditTask as never,
      status: "failed",
      statusReason: why,
    });
    notes.push(
      `Verifier did not run — ${why}. Nothing here has been fact-checked; read it as a raw draft.`,
    );
  }

  await convex().mutation(api.campaigns.setDrafts, {
    campaignId: campaignId as never,
    notes,
    drafts: drafts.map((d, i) => {
      const text = polished[i].text;
      const v = verdicts.get(i);
      return {
        topicId: d.topic.id,
        title: d.topic.title,
        pillar: d.topic.pillar,
        format: d.topic.format,
        platform,
        hookType: d.hookType,
        text,
        aiText: text, // frozen here: every later change is a human change
        wordCount: text.trim().split(/\s+/).filter(Boolean).length,
        edits: polished[i].edits,
        verdict: v?.verdict ?? "unaudited",
        issues: v?.issues ?? [],
        citations: d.citations.slice(0, 10),
        revisions: 0,
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// Revise loop — the CEO says what's wrong, Hone fixes exactly that.
// ---------------------------------------------------------------------------
export async function reviseDraft(
  campaignId: string,
  topicId: string,
  instruction: string,
): Promise<string> {
  const c = await loadCampaign(campaignId);
  if (!c) throw new Error("Campaign not found.");
  const draft = c.drafts.find((d) => d.topicId === topicId);
  if (!draft) throw new Error("Draft not found.");
  const tier = await resolveTier();
  const memory = await campaignMemoryBlock();
  const runDate = c.runDate;

  const taskId = await contract({
    runDate,
    role: "hone",
    objective: `Revise "${draft.title.slice(0, 80)}" to the CEO's instruction.`,
    definitionOfDone: [
      "The requested change is made",
      "Nothing else about the post moves",
    ],
    boundaries: ["Do exactly what was asked — no opportunistic rewrites"],
    maxOutputTokens: 2500,
    maxToolCalls: 0,
    maxUsd: 0.4,
  });
  const revised = await callWithEnvelope<PolishBatch>(
    {
      runDate,
      role: "hone",
      taskId,
      model: tier.models.worker,
      system: buildSystem(HONE_CHARTER),
      user:
        `${memory}\n\n### The CEO's instruction (this is the whole job)\n${instruction}\n\n` +
        `### The draft (index 0)\n${draft.text}\n\n` +
        `Apply the instruction. Change nothing the instruction didn't ask for. ` +
        `Return one entry with index 0.`,
      maxTokens: 2500,
    },
    PolishBatch,
  );
  await bill(campaignId, revised.costUsd);
  const out = revised.data.polished.find((p) => p.index === 0);
  if (!out) throw new Error("The editor returned no revision.");
  await deliver({
    taskId,
    runDate,
    role: "hone",
    kind: "revision",
    honestStatus: revised.data.status,
    summary: `Revision: ${instruction.slice(0, 120)}`,
    body: out.text,
    missing: revised.data.missing,
    uncertainties: revised.data.uncertainties,
    model: tier.models.worker,
    tokensIn: revised.usage.input_tokens ?? 0,
    tokensOut: revised.usage.output_tokens ?? 0,
    costUsd: revised.costUsd,
  });
  await selfClose(taskId, revised.data.summary);
  await convex().mutation(api.campaigns.updateDraft, {
    campaignId: campaignId as never,
    topicId,
    text: out.text,
    edits: out.edits,
    bumpRevision: true,
  });
  return out.text;
}

// ---------------------------------------------------------------------------
// The dispatcher the API route calls. Stage functions are idempotent per
// stage; this is what maps "the campaign is in stage X" to "do X".
// ---------------------------------------------------------------------------
const STAGE_RUNNERS: Record<string, (id: string) => Promise<void>> = {
  researching: runScoutStage,
  deep_research: runDeepResearchStage,
  drafting: runDraftStage,
};

export type AdvanceResult = { ran: boolean; stage: string; error?: string };

export async function advanceCampaign(campaignId: string): Promise<AdvanceResult> {
  const c = await loadCampaign(campaignId);
  if (!c) throw new Error("Campaign not found.");
  const runner = STAGE_RUNNERS[c.stage];
  if (!runner) return { ran: false, stage: c.stage };
  try {
    await runner(campaignId);
    const after = await loadCampaign(campaignId);
    return { ran: true, stage: after?.stage ?? c.stage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The stage that failed keeps its name in `error`, and the campaign parks
    // in `failed` so the UI can offer a retry from exactly where it stopped.
    await convex().mutation(api.campaigns.advanceStage, {
      campaignId: campaignId as never,
      from: c.stage,
      to: "failed",
      error: `[${c.stage}] ${message}`.slice(0, 600),
    });
    return { ran: false, stage: "failed", error: message };
  }
}

// Retry: put the campaign back into the stage that failed and run it again.
// The stage name is recovered from the `[stage]` prefix the failure recorded.
export async function retryCampaign(campaignId: string): Promise<AdvanceResult> {
  const c = await loadCampaign(campaignId);
  if (!c) throw new Error("Campaign not found.");
  if (c.stage !== "failed") return await advanceCampaign(campaignId);
  const m = c.error?.match(/^\[([a-z_]+)\]/);
  const stage = m?.[1] && STAGE_RUNNERS[m[1]] ? m[1] : "researching";
  await convex().mutation(api.campaigns.advanceStage, {
    campaignId: campaignId as never,
    from: "failed",
    to: stage,
  });
  return await advanceCampaign(campaignId);
}
