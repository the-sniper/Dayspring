"use server";

import { revalidatePath } from "next/cache";
import { api, convex } from "@/lib/convex/server";
import type { StrategyProposal } from "@/lib/orchestra/strategy";
import { todayDate } from "@/lib/orchestra/types";
import { isPlatformId } from "@/shared/platforms";

// Server actions for the Studio. The rule for what lives here vs the API
// route: anything instant (a checkpoint decision, a schedule, a memory write)
// is an action; anything that calls a model in a loop goes through
// /api/orchestra/campaign so the browser isn't holding a request open for it.
// The single exception is the revise loop — one short call, and the CEO is
// staring at the card waiting for it.

export type CampaignActionResult = {
  ok: boolean;
  message: string;
  campaignId?: string;
};

const STUDIO = "/company/studio";
const CALENDAR = "/company/studio/calendar";

function fail(err: unknown): CampaignActionResult {
  return { ok: false, message: err instanceof Error ? err.message : String(err) };
}

function refreshAll(): void {
  revalidatePath(STUDIO);
  revalidatePath(CALENDAR);
  revalidatePath("/company");
}

export async function createCampaignAction(input: {
  title: string;
  objective: string;
  seedIdeas: string;
  focus: string;
  startDate: string;
  endDate: string;
  targetPosts: number;
  platforms: string[];
}): Promise<CampaignActionResult> {
  const { hasApiKey } = await import("@/lib/claude/client");
  if (!(await hasApiKey())) {
    return {
      ok: false,
      message: "No Anthropic key — add it in Settings → API Keys first.",
    };
  }
  const platforms = input.platforms.filter(isPlatformId);
  if (!platforms.length) {
    return { ok: false, message: "Pick at least one platform." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    return { ok: false, message: "Give the campaign a start and end date." };
  }
  try {
    const seedIdeas = input.seedIdeas
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 20);
    const campaignId: string = await convex().mutation(api.campaigns.create, {
      runDate: todayDate(),
      title: input.title.trim() || `Campaign from ${input.startDate}`,
      ...(input.objective.trim() ? { objective: input.objective.trim() } : {}),
      seedIdeas,
      ...(input.focus.trim() ? { focus: input.focus.trim() } : {}),
      startDate: input.startDate,
      endDate: input.endDate,
      platforms,
      targetPosts: Math.min(Math.max(Math.round(input.targetPosts) || 4, 1), 20),
    });
    refreshAll();
    return { ok: true, message: "Campaign started — scouting topics.", campaignId };
  } catch (err) {
    return fail(err);
  }
}

export type PlanSlotInput = {
  slotId: string;
  date: string;
  platform: string;
  channel?: string;
  topicId: string;
  treatment: string;
  wantsImage: boolean;
  enabled: boolean;
};

// Checkpoint 1: save the edited schedule, optionally kicking off research.
export async function savePlanAction(
  campaignId: string,
  plan: PlanSlotInput[],
  start: boolean,
): Promise<CampaignActionResult> {
  try {
    const { slots } = await convex().mutation(api.campaigns.approvePlan, {
      campaignId: campaignId as never,
      plan: plan.map((s) => ({
        slotId: s.slotId,
        date: s.date,
        platform: s.platform,
        ...(s.channel?.trim() ? { channel: s.channel.trim() } : {}),
        topicId: s.topicId,
        treatment: s.treatment,
        wantsImage: s.wantsImage,
        enabled: s.enabled,
      })),
      start,
    });
    refreshAll();
    return {
      ok: true,
      message: start
        ? `${slots} slot(s) locked — researching each topic now.`
        : "Schedule saved.",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function chooseHooksAction(
  campaignId: string,
  choices: { slotId: string; index?: number }[],
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.campaigns.chooseHooks, {
      campaignId: campaignId as never,
      choices: choices.map((c) => ({
        slotId: c.slotId,
        ...(c.index === undefined ? {} : { index: c.index }),
      })),
    });
    refreshAll();
    return { ok: true, message: "Hooks locked — writing the drafts." };
  } catch (err) {
    return fail(err);
  }
}

export async function reviseDraftAction(
  campaignId: string,
  slotId: string,
  instruction: string,
): Promise<CampaignActionResult> {
  if (instruction.trim().length < 4) {
    return { ok: false, message: "Say what to change." };
  }
  try {
    const { reviseDraft } = await import("@/lib/orchestra/campaign");
    await reviseDraft(campaignId, slotId, instruction.trim());
    refreshAll();
    return { ok: true, message: "Revised — read it again." };
  } catch (err) {
    return fail(err);
  }
}

// Save the CEO's own edit of a draft. Distinct from approving: this banks a
// version so the edit can be walked back.
export async function saveDraftEditAction(
  campaignId: string,
  slotId: string,
  text: string,
  postTitle?: string,
): Promise<CampaignActionResult> {
  if (!text.trim()) return { ok: false, message: "A post can't be empty." };
  try {
    await convex().mutation(api.campaigns.updateDraft, {
      campaignId: campaignId as never,
      slotId,
      text: text.trim(),
      ...(postTitle !== undefined ? { postTitle: postTitle.trim() } : {}),
      by: "you",
    });
    refreshAll();
    return { ok: true, message: "Saved — the previous version is in history." };
  } catch (err) {
    return fail(err);
  }
}

export async function decideDraftAction(
  campaignId: string,
  slotId: string,
  decision: "approved" | "skipped",
  text?: string,
  postTitle?: string,
  reason?: string,
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.campaigns.decideDraft, {
      campaignId: campaignId as never,
      slotId,
      decision,
      ...(text ? { text } : {}),
      ...(postTitle !== undefined ? { postTitle } : {}),
    });
    // A skip with a reason is the cheapest teaching signal the company gets —
    // same path a rejection from the daily queue takes.
    if (decision === "skipped" && reason?.trim()) {
      const { appendLesson } = await import("@/lib/orchestra/memory");
      await appendLesson(`Skipped a draft: ${reason.trim()}`);
    }
    refreshAll();
    return {
      ok: true,
      message:
        decision === "approved"
          ? "Approved — it's in the queue, ready to copy on its day."
          : "Skipped.",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function setImageReadyAction(
  campaignId: string,
  slotId: string,
  ready: boolean,
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.campaigns.setImageReady, {
      campaignId: campaignId as never,
      slotId,
      ready,
    });
    refreshAll();
    return { ok: true, message: ready ? "Image marked ready." : "Image unmarked." };
  } catch (err) {
    return fail(err);
  }
}

export async function moveScheduleAction(
  campaignId: string,
  slotId: string,
  date: string,
): Promise<CampaignActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Pick a valid date." };
  }
  try {
    await convex().mutation(api.campaigns.setSchedule, {
      campaignId: campaignId as never,
      slots: [{ slotId, date }],
    });
    refreshAll();
    return { ok: true, message: "Moved." };
  } catch (err) {
    return fail(err);
  }
}

export async function finishCampaignAction(
  campaignId: string,
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.campaigns.close, {
      campaignId: campaignId as never,
    });
    refreshAll();
    return { ok: true, message: "Campaign closed." };
  } catch (err) {
    return fail(err);
  }
}

// Hard delete, posts included — for a campaign that shouldn't be in the
// record at all (a test run, a wrong objective). Its posts go too, because
// leaving them behind would feed the strategy review data you don't believe.
export async function deleteCampaignAction(
  campaignId: string,
): Promise<CampaignActionResult> {
  try {
    const { deletedPosts } = await convex().mutation(api.campaigns.remove, {
      campaignId: campaignId as never,
    });
    refreshAll();
    return {
      ok: true,
      message: `Campaign deleted${deletedPosts ? ` with ${deletedPosts} post(s)` : ""}.`,
    };
  } catch (err) {
    return fail(err);
  }
}

// ---- Editing an approved post (and walking it back) -------------------------

export async function updatePostAction(
  postId: string,
  text: string,
  title?: string,
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.orchestra.updatePost, {
      postId: postId as never,
      text,
      ...(title !== undefined ? { title } : {}),
    });
    refreshAll();
    return { ok: true, message: "Saved — previous version kept in history." };
  } catch (err) {
    return fail(err);
  }
}

export async function restorePostVersionAction(
  postId: string,
  index: number,
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.orchestra.restorePostVersion, {
      postId: postId as never,
      index,
    });
    refreshAll();
    return { ok: true, message: "Restored." };
  } catch (err) {
    return fail(err);
  }
}

export async function clearPostHistoryAction(
  postId: string,
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.orchestra.clearPostHistory, {
      postId: postId as never,
    });
    refreshAll();
    return { ok: true, message: "History cleared." };
  } catch (err) {
    return fail(err);
  }
}

// ---- The analytics loop -----------------------------------------------------

export async function recordMetricsAction(
  postId: string,
  metrics: {
    impressions?: number;
    reactions?: number;
    comments?: number;
    reposts?: number;
    note?: string;
  },
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.orchestra.recordPostMetrics, {
      postId: postId as never,
      ...metrics,
    });
    refreshAll();
    return {
      ok: true,
      message: "Logged — shipped, history cleared, Percy reads this next review.",
    };
  } catch (err) {
    return fail(err);
  }
}

// "This one sounded like me" — the voice-calibration loop, wired to the post
// that's already on file.
export async function addWritingSampleAction(input: {
  text: string;
  performance?: string;
  why?: string;
}): Promise<CampaignActionResult> {
  if (input.text.trim().length < 40) {
    return { ok: false, message: "That's too short to calibrate a voice on." };
  }
  try {
    const { appendSample } = await import("@/lib/orchestra/memory");
    await appendSample({
      text: input.text.trim(),
      ...(input.performance?.trim() ? { performance: input.performance.trim() } : {}),
      ...(input.why?.trim() ? { why: input.why.trim() } : {}),
    });
    revalidatePath("/company/team");
    refreshAll();
    return { ok: true, message: "Added to your voice samples." };
  } catch (err) {
    return fail(err);
  }
}

export async function runStrategyReviewAction(): Promise<CampaignActionResult> {
  try {
    const { runStrategyReview } = await import("@/lib/orchestra/strategy");
    const r = await runStrategyReview();
    refreshAll();
    return { ok: r.done, message: r.message };
  } catch (err) {
    return fail(err);
  }
}

export async function applyProposalAction(
  proposal: StrategyProposal,
): Promise<CampaignActionResult> {
  try {
    const { applyStrategyProposal } = await import("@/lib/orchestra/strategy");
    const message = await applyStrategyProposal(proposal);
    revalidatePath("/company/team");
    refreshAll();
    return { ok: true, message };
  } catch (err) {
    return fail(err);
  }
}

// ---- Memory: everything that can be added can be taken back out -------------
// Symmetry matters here. The Studio can write to three memory lists (lessons
// from a skip, samples from a shipped post, whatever a proposal adds), so the
// Studio has to be able to remove from all three too — not only the Team page.

export type MemoryList = "lessons" | "samples" | "dos" | "donts" | "bannedTopics" | "pillars" | "stories";

export async function removeMemoryItemAction(
  list: MemoryList,
  index: number,
): Promise<CampaignActionResult> {
  try {
    const {
      getBannedData,
      getLessonsData,
      getVoiceData,
      saveMemoryData,
    } = await import("@/lib/orchestra/memory");
    if (list === "lessons") {
      const data = await getLessonsData();
      if (!data.lessons[index]) return { ok: false, message: "Already gone." };
      data.lessons.splice(index, 1);
      await saveMemoryData("lessons", data);
    } else if (list === "bannedTopics") {
      const data = await getBannedData();
      if (!data.topics[index]) return { ok: false, message: "Already gone." };
      data.topics.splice(index, 1);
      await saveMemoryData("bannedTopics", data);
    } else {
      const voice = await getVoiceData();
      const target =
        list === "samples"
          ? voice.samples
          : list === "dos"
            ? voice.dos
            : list === "donts"
              ? voice.donts
              : list === "pillars"
                ? voice.pillars
                : voice.stories;
      if (!target[index]) return { ok: false, message: "Already gone." };
      target.splice(index, 1);
      await saveMemoryData("brandVoice", voice);
    }
    revalidatePath("/company/team");
    refreshAll();
    return { ok: true, message: "Removed from memory." };
  } catch (err) {
    return fail(err);
  }
}
