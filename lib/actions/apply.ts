"use server";

import { revalidatePath } from "next/cache";
import {
  approveAndSubmit,
  cancelSession,
  getSessionState,
  readOtp,
  recordManualSubmit,
  recordTosAck,
  resolveVerdict,
  startSession,
  vaultWorkdayAccount,
  type ApplySessionState,
  type StartResult,
} from "@/lib/apply/session";

export async function startApplyAction(jobId: string): Promise<StartResult> {
  return startSession(jobId);
}

export async function applyStateAction(
  jobId: string,
): Promise<ApplySessionState | null> {
  return getSessionState(jobId);
}

export async function acceptTosAction(
  host: string,
  jobId: string,
): Promise<StartResult> {
  await recordTosAck(host);
  return startSession(jobId);
}

export async function approveSubmitAction(jobId: string) {
  const res = await approveAndSubmit();
  if (res.ok && res.state.outcome === "submitted") revalidatePath(`/jobs/${jobId}`);
  return res;
}

export async function verdictAction(jobId: string, submitted: boolean) {
  const res = await resolveVerdict(submitted);
  if (res.ok && res.state.outcome === "submitted") revalidatePath(`/jobs/${jobId}`);
  return res;
}

export async function manualSubmittedAction(jobId: string) {
  const res = await recordManualSubmit();
  if (res.ok) revalidatePath(`/jobs/${jobId}`);
  return res;
}

export async function cancelApplyAction(jobId: string) {
  const res = await cancelSession();
  revalidatePath(`/jobs/${jobId}`);
  return res;
}

export async function readOtpAction() {
  return readOtp();
}

export async function vaultWorkdayAccountAction() {
  return vaultWorkdayAccount();
}
