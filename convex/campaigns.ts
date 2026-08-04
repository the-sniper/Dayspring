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
//   - every saved edit appends to `history` (max 10) and history is WIPED when
//     the post ships: it exists to support the edit loop, not to accumulate

const MAX_HISTORY = 10;

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

const SLOT = v.object({
  slotId: v.string(),
  date: v.string(),
  platform: v.string(),
  channel: v.optional(v.string()),
  topicId: v.string(),
  treatment: v.string(),
  wantsImage: v.boolean(),
  enabled: v.boolean(),
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
  slotId: v.optional(v.string()),
  options: v.array(v.object({ type: v.string(), text: v.string() })),
  chosenIndex: v.optional(v.number()),
});

const IMAGE = v.object({
  prompt: v.string(),
  altText: v.string(),
  aspect: v.string(),
  rationale: v.string(),
  ready: v.boolean(),
});

const HISTORY_ENTRY = v.object({
  text: v.string(),
  title: v.optional(v.string()),
  at: v.string(),
  by: v.string(),
});

const DRAFT = v.object({
  topicId: v.string(),
  slotId: v.optional(v.string()),
  title: v.string(),
  postTitle: v.optional(v.string()),
  channel: v.optional(v.string()),
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
  image: v.optional(IMAGE),
  history: v.optional(v.array(HISTORY_ENTRY)),
});

// Newest last, capped. The cap is a product decision, not a storage one: ten
// versions is enough to walk back a bad edit, and more turns the panel into an
// archive nobody reads.
function pushHistory(
  history: { text: string; title?: string; at: string; by: string }[] | undefined,
  entry: { text: string; title?: string; by: string },
): { text: string; title?: string; at: string; by: string }[] {
  const prev = history ?? [];
  // Don't record a version identical to the one already on top.
  const last = prev[prev.length - 1];
  if (last && last.text === entry.text && (last.title ?? "") === (entry.title ?? "")) {
    return prev;
  }
  return [...prev, { ...entry, at: new Date().toISOString() }].slice(-MAX_HISTORY);
}

export const create = mutation({
  args: {
    runDate: v.string(),
    title: v.string(),
    objective: v.optional(v.string()),
    seedIdeas: v.array(v.string()),
    focus: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.string(),
    platforms: v.array(v.string()),
    targetPosts: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = new Date().toISOString();
    if (args.endDate < args.startDate) {
      throw new Error("The campaign ends before it starts.");
    }
    if (args.platforms.length === 0) {
      throw new Error("Pick at least one platform.");
    }
    return await ctx.db.insert("orchCampaigns", {
      ...args,
      userId,
      stage: "researching",
      stageStartedAt: now,
      topics: [],
      selectedTopicIds: [],
      plan: [],
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

const DONE_STAGES = new Set(["complete", "failed"]);

// Campaigns still in flight — several can run at once, so the Studio shows a
// switcher rather than assuming there is one.
export const active = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("orchCampaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(40);
    return rows
      .filter((c) => !DONE_STAGES.has(c.stage))
      .map((c) => ({
        _id: c._id,
        title: c.title,
        stage: c.stage,
        startDate: c.startDate ?? c.runDate,
        endDate: c.endDate ?? c.runDate,
        platforms: c.platforms ?? [c.platform ?? "linkedin"],
        slots: (c.plan ?? []).filter((s) => s.enabled).length,
        drafts: c.drafts.length,
        approved: c.drafts.filter((d) => d.decision === "approved").length,
        costUsd: c.costUsd,
      }));
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
      startDate: c.startDate ?? c.runDate,
      endDate: c.endDate ?? c.runDate,
      platforms: c.platforms ?? [c.platform ?? "linkedin"],
      targetPosts: c.targetPosts,
      topics: c.topics.length,
      slots: (c.plan ?? []).filter((s) => s.enabled).length,
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

// Scout + rank + plan land together: the shortlist is only meaningful next to
// the schedule the team built from it.
export const setPlan = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    topics: v.array(TOPIC),
    plan: v.array(SLOT),
  },
  handler: async (ctx, { campaignId, topics, plan }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    await ctx.db.patch(campaignId, {
      topics,
      plan,
      stage: "plan_ready",
      stageStartedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

// Checkpoint 1. The CEO's edited schedule is what the rest of the campaign
// runs against; approving it starts the research stage.
export const approvePlan = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    plan: v.array(SLOT),
    start: v.optional(v.boolean()),
  },
  handler: async (ctx, { campaignId, plan, start }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const live = plan.filter((s) => s.enabled);
    if (start && live.length === 0) {
      throw new Error("Every slot is switched off — nothing to research.");
    }
    const known = new Set(c.topics.map((t) => t.id));
    for (const s of live) {
      if (!known.has(s.topicId)) throw new Error(`Slot ${s.slotId} points at a topic that doesn't exist.`);
    }
    await ctx.db.patch(campaignId, {
      plan,
      selectedTopicIds: [...new Set(live.map((s) => s.topicId))],
      updatedAt: new Date().toISOString(),
      ...(start
        ? {
            stage: "deep_research",
            stageStartedAt: new Date().toISOString(),
            error: undefined,
          }
        : {}),
    });
    return { slots: live.length };
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
      v.object({ slotId: v.string(), index: v.optional(v.number()) }),
    ),
  },
  handler: async (ctx, { campaignId, choices }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const bySlot = new Map(choices.map((x) => [x.slotId, x.index]));
    const hooks = c.hooks.map((h) => {
      const key = h.slotId ?? h.topicId;
      if (!bySlot.has(key)) return h;
      const idx = bySlot.get(key);
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
// the human change?" answerable later. Every save appends to history.
export const updateDraft = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    slotId: v.string(),
    text: v.string(),
    postTitle: v.optional(v.string()),
    edits: v.optional(v.array(v.string())),
    by: v.string(), // ai | editor | you
    bumpRevision: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(args.campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const drafts = c.drafts.map((d) => {
      if ((d.slotId ?? d.topicId) !== args.slotId) return d;
      return {
        ...d,
        // The version being REPLACED is what goes into history, so the list
        // reads as "what it was before each change".
        history: pushHistory(d.history, {
          text: d.text,
          ...(d.postTitle ? { title: d.postTitle } : {}),
          by: d.history?.length ? "previous" : "ai",
        }),
        text: args.text,
        ...(args.postTitle !== undefined ? { postTitle: args.postTitle } : {}),
        wordCount: args.text.trim().split(/\s+/).filter(Boolean).length,
        ...(args.edits ? { edits: args.edits } : {}),
        ...(args.bumpRevision ? { revisions: d.revisions + 1 } : {}),
      };
    });
    await ctx.db.patch(args.campaignId, {
      drafts,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

// Mark whether the image for a slot has been generated and attached. The team
// never generates it; this is the CEO reporting reality back.
export const setImageReady = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    slotId: v.string(),
    ready: v.boolean(),
  },
  handler: async (ctx, { campaignId, slotId, ready }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const drafts = c.drafts.map((d) =>
      (d.slotId ?? d.topicId) === slotId && d.image
        ? { ...d, image: { ...d.image, ready } }
        : d,
    );
    await ctx.db.patch(campaignId, { drafts, updatedAt: new Date().toISOString() });
    return null;
  },
});

// Checkpoint 3. Approving pushes the post into the existing orchPosts queue
// (the same human gate the daily run uses) — one place where posts live, one
// place where they get copied out. History travels with it so the edit loop
// continues after approval.
export const decideDraft = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    slotId: v.string(),
    decision: v.union(v.literal("approved"), v.literal("skipped")),
    text: v.optional(v.string()),
    postTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(args.campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const draft = c.drafts.find((d) => (d.slotId ?? d.topicId) === args.slotId);
    if (!draft) throw new Error("Draft not found.");
    if (draft.decision) throw new Error(`Already ${draft.decision}.`);

    let postId: typeof draft.postId;
    const text = (args.text ?? draft.text).trim();
    const postTitle = (args.postTitle ?? draft.postTitle ?? "").trim();
    if (args.decision === "approved") {
      if (!text) throw new Error("An approved post can't be empty.");
      const history =
        text === draft.text
          ? (draft.history ?? [])
          : pushHistory(draft.history, { text: draft.text, by: "previous" });
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
        ...(postTitle ? { title: postTitle } : {}),
        ...(draft.channel ? { channel: draft.channel } : {}),
        ...(draft.image ? { image: draft.image } : {}),
        ...(history.length ? { history } : {}),
        ...(draft.scheduledFor ? { scheduledFor: draft.scheduledFor } : {}),
      });
    }
    const drafts = c.drafts.map((d) =>
      (d.slotId ?? d.topicId) === args.slotId
        ? {
            ...d,
            decision: args.decision,
            text,
            ...(postTitle ? { postTitle } : {}),
            ...(postId ? { postId } : {}),
          }
        : d,
    );
    await ctx.db.patch(args.campaignId, {
      drafts,
      updatedAt: new Date().toISOString(),
    });
    return { postId: postId ?? null };
  },
});

// The content calendar: assign a date per draft. Applied to the queued post
// too, so /company and the calendar view show the same schedule.
export const setSchedule = mutation({
  args: {
    campaignId: v.id("orchCampaigns"),
    slots: v.array(v.object({ slotId: v.string(), date: v.string() })),
    finish: v.optional(v.boolean()),
  },
  handler: async (ctx, { campaignId, slots, finish }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const bySlot = new Map(slots.map((s) => [s.slotId, s.date]));
    const drafts = c.drafts.map((d) =>
      bySlot.has(d.slotId ?? d.topicId)
        ? { ...d, scheduledFor: bySlot.get(d.slotId ?? d.topicId) }
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

// Close a campaign (done, or abandoned). Nothing is deleted — the record and
// its spend stay on the books.
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

// Hard delete — for a campaign that was a mistake (a test run, a wrong
// objective). Posts it already queued are deleted with it, because leaving
// them behind would poison the analytics the strategy review reads.
export const remove = mutation({
  args: { campaignId: v.id("orchCampaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUser(ctx);
    const c = owned(await ctx.db.get(campaignId), userId);
    if (!c) throw new Error("Campaign not found.");
    const posts = await ctx.db
      .query("orchPosts")
      .withIndex("by_user_campaign", (q) =>
        q.eq("userId", userId).eq("campaignId", campaignId),
      )
      .take(100);
    for (const p of posts) await ctx.db.delete(p._id);
    await ctx.db.delete(campaignId);
    return { deletedPosts: posts.length };
  },
});
