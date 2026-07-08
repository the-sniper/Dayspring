import type { Page } from "playwright";
import { findRecentCodes } from "@/lib/gmail/otp";

// Workday account creation + auto-OTP for apply-assist. HIGHEST ban-risk lane —
// used ONLY from the attended CLI (scripts/apply.ts), with a human watching and
// a hard CAPTCHA stop. Returns the credential to vault on success.

export type SignupOutcome =
  | { ok: true; created: boolean; username: string; password: string }
  | { ok: false; error: string };

// Poll Gmail for a Workday verification code that arrived after `since`.
export async function waitForWorkdayCode({
  sinceMs,
  timeoutMs = 120_000,
}: {
  sinceMs: number;
  timeoutMs?: number;
}): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const codes = await findRecentCodes({ withinMinutes: 5 });
    const hit = codes.find(
      (c) =>
        c.code &&
        Date.parse(c.receivedAt) >= sinceMs - 30_000 &&
        /workday|verif|account/i.test(`${c.from} ${c.subject}`),
    );
    if (hit?.code) return hit.code;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

// Detect whether the Workday page is showing a sign-in vs create-account view.
// Best-effort; the human confirms in the attended window regardless.
export async function isSignedIn(page: Page): Promise<boolean> {
  try {
    // A signed-in Workday apply page shows an "Apply" / "Start Your Application"
    // control and no email/password fields.
    const hasPassword = await page.locator('input[type="password"]').count();
    return hasPassword === 0;
  } catch {
    return false;
  }
}
