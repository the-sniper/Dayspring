"use server";

import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import {
  createDraft,
  createNudgeDraft,
  deleteDraft,
  markReplied,
  markSentManually,
  sendOutreach,
  updateDraft,
} from "@/lib/outreach/core";

const NO_KEY = "Drafting needs ANTHROPIC_API_KEY in .env.local (see Settings).";

export async function draftOutreachAction(contactId: number, jobId: number) {
  if (!hasApiKey()) return { ok: false as const, error: NO_KEY };
  const res = await createDraft(contactId, jobId);
  revalidatePath("/outreach");
  return res;
}

export async function draftNudgeAction(originalId: number) {
  if (!hasApiKey()) return { ok: false as const, error: NO_KEY };
  const res = await createNudgeDraft(originalId);
  revalidatePath("/outreach");
  return res;
}

export async function sendOutreachAction(
  id: number,
  subject: string,
  body: string,
) {
  // Persist any in-editor edits, then send exactly what's stored.
  const upd = updateDraft(id, subject, body);
  if (!upd.ok) return upd;
  const res = await sendOutreach(id);
  revalidatePath("/", "layout");
  return res;
}

export async function markSentAction(id: number, subject: string, body: string) {
  const upd = updateDraft(id, subject, body);
  if (!upd.ok) return upd;
  const res = markSentManually(id);
  revalidatePath("/", "layout");
  return res;
}

// Void — used as a bound <form> action.
export async function markRepliedAction(id: number): Promise<void> {
  markReplied(id);
  revalidatePath("/", "layout");
}

export async function deleteDraftAction(id: number) {
  const res = deleteDraft(id);
  revalidatePath("/outreach");
  return res;
}
