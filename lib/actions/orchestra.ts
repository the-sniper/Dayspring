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
