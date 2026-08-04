"use server";

import { revalidatePath } from "next/cache";
import { api, convex } from "@/lib/convex/server";
import type { StrategyProposal } from "@/lib/orchestra/strategy";
import { todayDate } from "@/lib/orchestra/types";

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

function fail(err: unknown): CampaignActionResult {
  return { ok: false, message: err instanceof Error ? err.message : String(err) };
}

export async function createCampaignAction(input: {
  title: string;
  seedIdeas: string;
  focus: string;
  targetPosts: number;
  platform: string;
}): Promise<CampaignActionResult> {
  const { hasApiKey } = await import("@/lib/claude/client");
  if (!(await hasApiKey())) {
    return {
      ok: false,
      message: "No Anthropic key — add it in Settings → API Keys first.",
    };
  }
  try {
    const seedIdeas = input.seedIdeas
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 20);
    const campaignId: string = await convex().mutation(api.campaigns.create, {
      runDate: todayDate(),
      title: input.title.trim() || `Content week of ${todayDate()}`,
      seedIdeas,
      ...(input.focus.trim() ? { focus: input.focus.trim() } : {}),
      targetPosts: Math.min(Math.max(Math.round(input.targetPosts) || 4, 1), 8),
      platform: ["linkedin", "x"].includes(input.platform)
        ? input.platform
        : "linkedin",
    });
    revalidatePath(STUDIO);
    return { ok: true, message: "Campaign started — scouting topics.", campaignId };
  } catch (err) {
    return fail(err);
  }
}

export async function selectTopicsAction(
  campaignId: string,
  topicIds: string[],
): Promise<CampaignActionResult> {
  try {
    const { count } = await convex().mutation(api.campaigns.selectTopics, {
      campaignId: campaignId as never,
      topicIds,
    });
    revalidatePath(STUDIO);
    return {
      ok: true,
      message: `${count} topic(s) selected — researching each one now.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function chooseHooksAction(
  campaignId: string,
  choices: { topicId: string; index?: number }[],
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.campaigns.chooseHooks, {
      campaignId: campaignId as never,
      choices: choices.map((c) => ({
        topicId: c.topicId,
        ...(c.index === undefined ? {} : { index: c.index }),
      })),
    });
    revalidatePath(STUDIO);
    return { ok: true, message: "Hooks locked — writing the drafts." };
  } catch (err) {
    return fail(err);
  }
}

export async function reviseDraftAction(
  campaignId: string,
  topicId: string,
  instruction: string,
): Promise<CampaignActionResult> {
  if (instruction.trim().length < 4) {
    return { ok: false, message: "Say what to change." };
  }
  try {
    const { reviseDraft } = await import("@/lib/orchestra/campaign");
    await reviseDraft(campaignId, topicId, instruction.trim());
    revalidatePath(STUDIO);
    return { ok: true, message: "Revised — read it again." };
  } catch (err) {
    return fail(err);
  }
}

export async function decideDraftAction(
  campaignId: string,
  topicId: string,
  decision: "approved" | "skipped",
  text?: string,
  reason?: string,
): Promise<CampaignActionResult> {
  try {
    await convex().mutation(api.campaigns.decideDraft, {
      campaignId: campaignId as never,
      topicId,
      decision,
      ...(text ? { text } : {}),
    });
    // A skip with a reason is the cheapest teaching signal the company gets —
    // same path a rejection from the daily queue takes.
    if (decision === "skipped" && reason?.trim()) {
      const { appendLesson } = await import("@/lib/orchestra/memory");
      await appendLesson(`Skipped a draft: ${reason.trim()}`);
    }
    revalidatePath(STUDIO);
    revalidatePath("/company");
    return {
      ok: true,
      message:
        decision === "approved"
          ? "Approved — it's in the queue on /company, ready to copy."
          : "Skipped.",
    };
  } catch (err) {
    return fail(err);
  }
}

// Build the calendar in code (pillar rotation, weekdays only) and store it.
export async function scheduleCampaignAction(
  campaignId: string,
): Promise<CampaignActionResult> {
  try {
    const { scheduleByPillar } = await import("@/lib/orchestra/calendar");
    const c = await convex().query(api.campaigns.get, {
      campaignId: campaignId as never,
    });
    if (!c) return { ok: false, message: "Campaign not found." };
    const live = c.drafts.filter((d) => d.decision !== "skipped");
    if (!live.length) return { ok: false, message: "Nothing to schedule." };
    const slots = scheduleByPillar(
      live.map((d) => ({ topicId: d.topicId, pillar: d.pillar })),
      todayDate(),
    );
    await convex().mutation(api.campaigns.setSchedule, {
      campaignId: campaignId as never,
      slots,
    });
    revalidatePath(STUDIO);
    return { ok: true, message: `Scheduled ${slots.length} post(s).` };
  } catch (err) {
    return fail(err);
  }
}

export async function moveScheduleAction(
  campaignId: string,
  topicId: string,
  date: string,
): Promise<CampaignActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Pick a valid date." };
  }
  try {
    await convex().mutation(api.campaigns.setSchedule, {
      campaignId: campaignId as never,
      slots: [{ topicId, date }],
    });
    revalidatePath(STUDIO);
    revalidatePath("/company");
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
    revalidatePath(STUDIO);
    return { ok: true, message: "Campaign closed." };
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
    revalidatePath(STUDIO);
    revalidatePath("/company");
    return { ok: true, message: "Logged — Percy reads this on the next review." };
  } catch (err) {
    return fail(err);
  }
}

// "This one sounded like me" — the voice-calibration loop from the reference
// build, wired to the post that's already on file.
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
    revalidatePath(STUDIO);
    return { ok: true, message: "Added to your voice samples." };
  } catch (err) {
    return fail(err);
  }
}

export async function runStrategyReviewAction(): Promise<CampaignActionResult> {
  try {
    const { runStrategyReview } = await import("@/lib/orchestra/strategy");
    const r = await runStrategyReview();
    revalidatePath(STUDIO);
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
    revalidatePath(STUDIO);
    revalidatePath("/company/team");
    return { ok: true, message };
  } catch (err) {
    return fail(err);
  }
}
