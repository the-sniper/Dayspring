"use server";

import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import { BudgetExceededError, runOrchestra } from "@/lib/orchestra/run";

export type OrchestraActionResult = {
  ok: boolean;
  message: string;
};

// Kick today's run from /company. Idempotent — a same-day re-click just
// surfaces the existing report. Long-running (a few minutes): the button
// shows a pending state while this resolves.
export async function runOrchestraAction(): Promise<OrchestraActionResult> {
  if (!(await hasApiKey())) {
    return {
      ok: false,
      message: "No Anthropic key — add it in Settings → API Keys first.",
    };
  }
  try {
    const result = await runOrchestra();
    revalidatePath("/company");
    return {
      ok: true,
      message: result.ran
        ? `Run complete — verified ${result.stats.verified}, escalated ${result.stats.escalated}, $${result.stats.costUsd.toFixed(2)} spent.`
        : "Already ran today — showing the existing report.",
    };
  } catch (err) {
    revalidatePath("/company");
    if (err instanceof BudgetExceededError) {
      return { ok: false, message: err.message };
    }
    return {
      ok: false,
      message: `Run failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// Tier switch from /company/team. Applies from the NEXT run: the engine
// resolves the tier once at run start, so an in-flight run keeps its models
// and cache; all board context is model-independent (see lib/orchestra/tiers).
export async function setTierAction(
  tier: string,
): Promise<OrchestraActionResult> {
  const { isTierId, setTier, TIERS } = await import("@/lib/orchestra/tiers");
  if (!isTierId(tier)) {
    return { ok: false, message: `Unknown tier "${tier}".` };
  }
  await setTier(tier);
  revalidatePath("/company/team");
  revalidatePath("/company");
  return {
    ok: true,
    message: `Tier set to ${TIERS[tier].label} — applies from the next run.`,
  };
}

// ---- Phase 2: the human gate ------------------------------------------------

export async function approvePostAction(
  postId: string,
  text: string,
): Promise<OrchestraActionResult> {
  const { api, convex } = await import("@/lib/convex/server");
  try {
    await convex().mutation(api.orchestra.decidePost, {
      postId: postId as never,
      decision: "approved",
      ...(text.trim() ? { text: text.trim() } : {}),
    });
    revalidatePath("/company");
    return { ok: true, message: "Approved — copy it and post when ready." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function rejectPostAction(
  postId: string,
  reason: string,
): Promise<OrchestraActionResult> {
  const { api, convex } = await import("@/lib/convex/server");
  const { appendLesson } = await import("@/lib/orchestra/memory");
  try {
    const { platform, angle } = await convex().mutation(
      api.orchestra.decidePost,
      {
        postId: postId as never,
        decision: "rejected",
        rejectReason: reason,
      },
    );
    // The rejection becomes institutional memory — agents read this next run.
    await appendLesson(
      `Rejected ${platform} draft ("${angle.slice(0, 80)}"): ${reason}`,
    );
    revalidatePath("/company");
    return { ok: true, message: "Rejected — reason filed to the lessons memory." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function markPostedAction(
  postId: string,
): Promise<OrchestraActionResult> {
  const { api, convex } = await import("@/lib/convex/server");
  try {
    await convex().mutation(api.orchestra.decidePost, {
      postId: postId as never,
      decision: "posted",
    });
    revalidatePath("/company");
    return { ok: true, message: "Marked as posted." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveMemoryDataAction(
  key: string,
  json: string,
): Promise<OrchestraActionResult> {
  const { MEMORY_KEYS, saveMemoryData } = await import("@/lib/orchestra/memory");
  if (!(key in MEMORY_KEYS)) {
    return { ok: false, message: `Unknown memory file "${key}".` };
  }
  try {
    let value = JSON.parse(json) as never;
    let note = "";
    if (key === "brandVoice") {
      const { verifyProjects } = await import("@/lib/orchestra/memory");
      const v = value as { projects?: { name: string; url: string }[] };
      if (v.projects) {
        const checked = await verifyProjects(v.projects);
        const failed = checked.filter((p) => p.url && !p.verifiedAt);
        const noUrl = checked.filter((p) => !p.url);
        v.projects = checked as never;
        value = v as never;
        if (failed.length)
          note = ` ⚠ Could not verify: ${failed.map((p) => p.name).join(", ")} (URL didn't respond — name-only for agents).`;
        else if (noUrl.length)
          note = ` ${noUrl.map((p) => p.name).join(", ")}: no URL — name-only for agents until one is added.`;
      }
    }
    await saveMemoryData(key as keyof typeof MEMORY_KEYS, value);
    revalidatePath("/company/team");
    return { ok: true, message: `Saved — agents read it on the next run.${note}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ---- Phase 4: eng request intake -------------------------------------------

export async function fileEngRequestAction(
  objective: string,
): Promise<OrchestraActionResult> {
  if (objective.trim().length < 10) {
    return { ok: false, message: "Describe the request in a sentence or two." };
  }
  const { api, convex } = await import("@/lib/convex/server");
  const { todayDate } = await import("@/lib/orchestra/types");
  await convex().mutation(api.orchestra.createTask, {
    runDate: todayDate(),
    role: "forge",
    objective: objective.trim(),
    definitionOfDone: [
      "Spec grounded in the actual codebase (files/conventions named)",
      "2-8 checkable acceptance criteria",
      "Out-of-scope named",
    ],
    boundaries: ["Spec only — implementation is Mason's (a Claude Code session)"],
    budgets: { maxOutputTokens: 4000, maxToolCalls: 15, maxUsd: 2 },
  });
  revalidatePath("/company");
  return {
    ok: true,
    message: 'Filed. Hit "Run Forge" in Operations — the spec lands on the board.',
  };
}

// ---- Phase 5 / no-terminal ops: everything runnable from the UI ------------
// Forge/Probe/calibration touch the repo working tree, so these work when the
// Next server runs locally in the repo (npm run dev) — which is how Dayspring
// runs. On a hosted deployment they return a clear error instead of failing
// silently.

export async function runRetroAction(): Promise<OrchestraActionResult> {
  try {
    const { runRetro } = await import("@/lib/orchestra/retro");
    const r = await runRetro();
    revalidatePath("/company");
    return { ok: r.done, message: r.message.split("\n")[0] };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runForgeAction(): Promise<OrchestraActionResult> {
  try {
    const { runForgeSpec } = await import("@/lib/orchestra/eng");
    const r = await runForgeSpec();
    revalidatePath("/company");
    return { ok: r.done, message: r.message.split("\n")[0] };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runProbeAction(): Promise<OrchestraActionResult> {
  try {
    const { runProbeReview } = await import("@/lib/orchestra/eng");
    const r = await runProbeReview();
    revalidatePath("/company");
    return { ok: r.done, message: r.message.split("\n")[0] };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function freezeGoldenAction(): Promise<OrchestraActionResult> {
  try {
    const { freezeGoldenCase } = await import("@/lib/orchestra/evalcore");
    const message = await freezeGoldenCase();
    revalidatePath("/company/team");
    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runCalibrationAction(): Promise<OrchestraActionResult> {
  try {
    const { runGoldenSuite } = await import("@/lib/orchestra/evalcore");
    const r = await runGoldenSuite();
    revalidatePath("/company/team");
    return {
      ok: r.total > 0,
      message: r.lines.slice(-2).join(" "),
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
