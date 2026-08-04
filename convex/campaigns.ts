import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { owned, requireUser } from "./lib";

// Studio campaigns — the checkpoint-driven content pipeline (the UI half of
// the GTM team). The rules that matter live here, not in prompts:
//   - the engine may only advance a campaign from the stage the UI left it in
//     (advanceStage takes `from`, so a double-click or a stale tab can't run a
//     stage twice)
//   - stage payloads are write-once per stage: re-running a stage overwrites
//     its own output and nothing downstream
//   - `aiText` on a draft is frozen at draft time — every human edit stays
//     measurable (the human-edit floor the outreach ledger already enforces)

const TOPIC = v.object({
  id: v.string(),
  rank: v.number(),
  title: v.string(),
  source: v.string(),
  pillar: v.string(),
  format: v.string(),
  angle: v.string(),
  whyNow: v.string(),
});

const BRIEF = v.object({
  topicId: v.string(),
  keyStats: v.array(v.string()),
  examples: v.array(v.string()),
  angles: v.array(v.string()),
  citations: v.array(v.object({ title: v.string(), url: v.string() })),
  status: v.string(),
});

const HOOKSET = v.object({
  topicId: v.string(),
  options: v.array(v.object({ type: v.string(), text: v.string() })),
  chosenIndex: v.optional(v.number()),
});

const DRAFT = v.object({
  topicId: v.string(),
  title: v.string(),
  pillar: v.string(),
  format: v.string(),
  platform: v.string(),
  hookType: v.string(),
  text: v.string(),
  aiText: v.string(),
  wordCount: v.number(),
  edits: v.array(v.string()),
  verdict: v.string(),
  issues: v.array(v.string()),
  citations: v.array(v.object({ title: v.string(), url: v.string() })),
  decision: v.optional(v.string()),
  revisions: v.number(),
  scheduledFor: v.optional(v.string()),
  postId: v.optional(v.id("orchPosts")),
});

export const create = mutation({
  args: {
    runDate: v.string(),
    title: v.string(),
    seedIdeas: v.array(v.string()),
    focus: v.optional(v.string()),
    targetPosts: v.number(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("orchCampaigns", {
      ...args,
      userId,
      stage: "researching",
      stageStartedAt: now,
      topics: [],
      selectedTopicIds: [],
      briefs: [],
      hooks: [],
      drafts: [],
      costUsd: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const get = query({
  args: { campaignId: v.id("orchCampaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    return owned(await ctx.db.get(campaignId), userId);
  },
});

// Newest campaign — what /company/studio opens on.
export const latest = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("orchCampaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("orchCampaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(limit ?? 12, 50));
    // Trim the heavy payloads — the history strip only needs the headline.
    return rows.map((c) => ({
      _id: c._id,
      runDate: c.runDate,
      title: c.title,
      stage: c.stage,
      targetPosts: c.targetPosts,
      topics: c.topics.length,
      drafts: c.drafts.length,
      approved: c.drafts.filter((d) => d.decision === "approved").length,
      costUsd: c.costUsd,
      createdAt: c.createdAt,
    }));
  },
});

// The engine's only way to move the machine. `from` is a compare-and-swap:
// if the campaign already left that stage (another tab, a retry, a finished
// background run), this is a no-op and the caller learns it moved on.
export const advanceStage = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    from: v.optional(v.string()),
    to: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(args.campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    if (args.from && c.stage !== args.from) return { moved: false, stage: c.stage };
    await ctx.db.patch(args.campaignId, {
      stage: args.to,
      stageStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(args.error ? { error: args.error } : {}),
    });
    return { moved: true, stage: args.to };
  },
});

export const addCost = mutation({
  args: { campaignId: v.id("orchCampaigns"), costUsd: v.number() },
  handler: async (ctx, { campaignId, costUsd }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    await ctx.db.patch(campaignId, {
      costUsd: Math.round((c.costUsd + costUsd) * 10000) / 10000,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const setTopics = mutation({
  args: { campaignId: v.id("orchCampaigns"), topics: v.array(TOPIC) },
  handler: async (ctx, { campaignId, topics }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    await ctx.db.patch(campaignId, {
      topics,
      stage: "topics_ready",
      stageStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

// Checkpoint 1. Selecting topics is what starts the deep-research stage, so
// the transition and the selection are one transaction.
export const selectTopics = mutation({
  args: { campaignId: v.id("orchCampaigns"), topicIds: v.array(v.string()) },
  handler: async (ctx, { campaignId, topicIds }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    if (topicIds.length === 0) throw new Error("Pick at least one topic.");
    const known = new Set(c.topics.map((t) => t.id));
    const picked = topicIds.filter((id) => known.has(id));
    if (picked.length === 0) throw new Error("None of those topics exist.");
    await ctx.db.patch(campaignId, {
      selectedTopicIds: picked,
      stage: "deep_research",
      stageStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: undefined,
    });
    return { count: picked.length };
  },
});

export const setBriefsAndHooks = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    briefs: v.array(BRIEF),
    hooks: v.array(HOOKSET),
  },
  handler: async (ctx, { campaignId, briefs, hooks }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    await ctx.db.patch(campaignId, {
      briefs,
      hooks,
      stage: "hooks_ready",
      stageStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

// Checkpoint 2. An absent index means "let the writer choose" — a real
// option, not a missing answer, so it is stored as such.
export const chooseHooks = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    choices: v.array(
      v.object({ topicId: v.string(), index: v.optional(v.number()) }),
    ),
  },
  handler: async (ctx, { campaignId, choices }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const byTopic = new Map(choices.map((x) => [x.topicId, x.index]));
    const hooks = c.hooks.map((h) => {
      if (!byTopic.has(h.topicId)) return h;
      const idx = byTopic.get(h.topicId);
      const valid =
        idx !== undefined && idx >= 0 && idx < h.options.length ? idx : undefined;
      return { ...h, chosenIndex: valid };
    });
    await ctx.db.patch(campaignId, {
      hooks,
      stage: "drafting",
      stageStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: undefined,
    });
    return null;
  },
});

export const setDrafts = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    drafts: v.array(DRAFT),
    notes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { campaignId, drafts, notes }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    await ctx.db.patch(campaignId, {
      drafts,
      notes: notes ?? [],
      stage: "drafts_ready",
      stageStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

// Replace one draft's text — used by the revise loop and by inline editing.
// `aiText` is never touched: the frozen original is what makes "how much did
// the human change?" answerable later.
export const updateDraft = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    topicId: v.string(),
    text: v.string(),
    edits: v.optional(v.array(v.string())),
    bumpRevision: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(args.campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const drafts = c.drafts.map((d) =>
      d.topicId === args.topicId
        ? {
            ...d,
            text: args.text,
            wordCount: args.text.trim().split(/\s+/).filter(Boolean).length,
            ...(args.edits ? { edits: args.edits } : {}),
            ...(args.bumpRevision ? { revisions: d.revisions + 1 } : {}),
          }
        : d,
    );
    await ctx.db.patch(args.campaignId, {
      drafts,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

// Checkpoint 3. Approving pushes the post into the existing orchPosts queue
// (the same human gate the daily run uses) — one place where posts live, one
// place where they get copied out.
export const decideDraft = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    topicId: v.string(),
    decision: v.union(v.literal("approved"), v.literal("skipped")),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(args.campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const draft = c.drafts.find((d) => d.topicId === args.topicId);
    if (!draft) throw new Error("Draft not found.");
    if (draft.decision) throw new Error(`Already ${draft.decision}.`);

    let postId: typeof draft.postId;
    const text = (args.text ?? draft.text).trim();
    if (args.decision === "approved") {
      if (!text) throw new Error("An approved post can't be empty.");
      postId = await ctx.db.insert("orchPosts", {
        userId,
        runDate: c.runDate,
        platform: draft.platform,
        angle: `${draft.title} — ${draft.pillar}`,
        text,
        aiText: draft.aiText,
        citations: draft.citations,
        status: "approved", // the CEO just approved it, here
        decidedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        campaignId: args.campaignId,
        topicTitle: draft.title,
        pillar: draft.pillar,
        format: draft.format,
        hookType: draft.hookType,
        ...(draft.scheduledFor ? { scheduledFor: draft.scheduledFor } : {}),
      });
    }
    const drafts = c.drafts.map((d) =>
      d.topicId === args.topicId
        ? { ...d, decision: args.decision, text, ...(postId ? { postId } : {}) }
        : d,
    );
    await ctx.db.patch(args.campaignId, {
      drafts,
      updatedAt: new Date().toISOString(),
    });
    return { postId: postId ?? null };
  },
});

// The content calendar: assign a date per approved/pending draft. Applied to
// the queued post too, so /company shows the same schedule.
export const setSchedule = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    slots: v.array(v.object({ topicId: v.string(), date: v.string() })),
    finish: v.optional(v.boolean()),
  },
  handler: async (ctx, { campaignId, slots, finish }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const byTopic = new Map(slots.map((s) => [s.topicId, s.date]));
    const drafts = c.drafts.map((d) =>
      byTopic.has(d.topicId)
        ? { ...d, scheduledFor: byTopic.get(d.topicId) }
        : d,
    );
    for (const d of drafts) {
      if (d.postId && d.scheduledFor) {
        await ctx.db.patch(d.postId, { scheduledFor: d.scheduledFor });
      }
    }
    await ctx.db.patch(campaignId, {
      drafts,
      updatedAt: new Date().toISOString(),
      ...(finish ? { stage: "complete", stageStartedAt: new Date().toISOString() } : {}),
    });
    return null;
  },
});

// Abandon a campaign that went wrong (or that you no longer want) so the
// Studio opens clean. Nothing is deleted — the record and its spend stay.
export const close = mutation({
  args: { campaignId: v.id("orchCampaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    await ctx.db.patch(campaignId, {
      stage: "complete",
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});
