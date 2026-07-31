"use server";

import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import {
  scoreOneJob,
  scoreUnscored,
  type BatchScoreResult,
  type ScoreOneResult,
} from "@/lib/jobs/score";

import { keyMessages } from "@/lib/keys/messages";

const NO_KEY = keyMessages.scoring;

export async function scoreJobAction(
  jobId: string,
  force = false,
): Promise<ScoreOneResult> {
  if (!await hasApiKey()) return { ok: false, error: NO_KEY };
  const res = await scoreOneJob(jobId, force);
  revalidatePath("/", "layout");
  return res;
}

export type ScoreBatchActionResult =
  | ({ ok: true } & BatchScoreResult)
  | { ok: false; error: string };

export async function scoreUnscoredAction(): Promise<ScoreBatchActionResult> {
  if (!await hasApiKey()) return { ok: false, error: NO_KEY };
  const res = await scoreUnscored();
  if ("profileMissing" in res) {
    return { ok: false, error: "No profile yet — paste your resume in Settings first." };
  }
  revalidatePath("/", "layout");
  return { ok: true, ...res };
}
