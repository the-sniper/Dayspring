import {
  getMessage,
  hasGmail,
  listMessages,
} from "@/lib/integrations/gmail/client";

export type VerificationCode = {
  messageId: string;
  from: string;
  subject: string;
  code: string | null;
  link: string | null;
  receivedAt: string; // ISO
};

// Signals that an email is an auth/verification message.
const OTP_HINT =
  /\b(verification|verify|one[- ]?time|confirm|sign[- ]?in|log[- ]?in|security code|passcode|\bOTP\b|2fa|authenticat)/i;

// A digit run of 4–8 near a code keyword — avoiding years, phone numbers, and
// long ids. We scan for the keyword, then the nearest standalone 4–8 digit run.
const CODE_NEAR_KEYWORD =
  /(?:code|otp|passcode|pin|is|:)\s*(?:is\s*)?[:#]?\s*([0-9]{4,8})\b/i;
const STANDALONE_CODE = /\b([0-9]{4,8})\b/;

const VERIFY_LINK =
  /https?:\/\/[^\s"'<>]*(?:verify|confirm|magic|activate|token=|code=|login|signin|auth)[^\s"'<>]*/i;

function extractCode(text: string): string | null {
  // Prefer a digit run adjacent to a code keyword.
  const near = text.match(CODE_NEAR_KEYWORD);
  if (near) return near[1];
  // Otherwise, only trust a standalone run if the body looks OTP-ish and the
  // run isn't an obvious year (1900–2099).
  if (OTP_HINT.test(text)) {
    const m = text.match(STANDALONE_CODE);
    if (m && !/^(19|20)\d{2}$/.test(m[1])) return m[1];
  }
  return null;
}

// Scan the recent inbox for verification codes / magic links. Read-only,
// Gmail-gated. Returns newest first. Useful standalone (copy a code while
// signing up by hand) and as the substrate for future auto-OTP.
export async function findRecentCodes({
  withinMinutes = 15,
  max = 12,
}: { withinMinutes?: number; max?: number } = {}): Promise<VerificationCode[]> {
  if (!hasGmail()) return [];

  // Gmail query granularity is days/hours; we hard-filter by internalDate.
  const ids = await listMessages(
    `in:inbox newer_than:1h (verification OR verify OR code OR confirm OR "sign in" OR OTP OR passcode)`,
    max,
  );
  const cutoff = Date.now() - withinMinutes * 60_000;

  const out: VerificationCode[] = [];
  for (const { id } of ids) {
    try {
      const msg = await getMessage(id);
      if (msg.internalDate < cutoff) continue;
      const haystack = `${msg.subject}\n${msg.text}`;
      if (!OTP_HINT.test(haystack)) continue;
      const code = extractCode(haystack);
      const link = haystack.match(VERIFY_LINK)?.[0] ?? null;
      if (!code && !link) continue;
      out.push({
        messageId: id,
        from: msg.from,
        subject: msg.subject,
        code,
        link,
        receivedAt: new Date(msg.internalDate).toISOString(),
      });
    } catch {
      // Skip a message that fails to fetch/parse.
    }
  }
  return out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}
