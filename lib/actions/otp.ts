"use server";

import { hasGmail } from "@/lib/integrations/gmail/client";
import { findRecentCodes, type VerificationCode } from "@/lib/gmail/otp";

export type OtpActionResult =
  | { ok: true; codes: VerificationCode[] }
  | { ok: false; error: string };

export async function fetchRecentCodesAction(): Promise<OtpActionResult> {
  if (!await hasGmail()) {
    return { ok: false, error: "Connect Gmail in Settings to read verification codes." };
  }
  try {
    return { ok: true, codes: await findRecentCodes({ withinMinutes: 20 }) };
  } catch (err) {
    return { ok: false, error: friendlyGmailError(err) };
  }
}

// The Gmail API must be enabled in the Google Cloud project (separate from
// OAuth consent). This 403 also gates send + reply-detection, so surface it
// actionably wherever it first appears.
function friendlyGmailError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw.includes("has not been used in project") || raw.includes("it is disabled")) {
    return "Gmail API isn't enabled in your Google Cloud project. Enable it at console.cloud.google.com → APIs & Services → Library → Gmail API. (This also unblocks outreach send + reply detection.)";
  }
  if (raw.includes("HTTP 401") || raw.includes("invalid_grant")) {
    return "Gmail auth expired — re-run `npm run gmail:auth`.";
  }
  return raw || "Couldn't read inbox";
}
