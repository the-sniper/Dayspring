// Composition + cadence rules for outreach, shared by the composer UI and the
// server-side send path so the gates can't be bypassed by a stale client.
//
// The numbers come from the outreach evidence base (Pin benchmark report,
// 4M+ messages): 150–199-word bodies and 5–6-word subjects reply best,
// touches 1–3 produce 93.2% of all replies, and first-name use nearly
// doubles email replies. The humanEditedPct floor is DaySpring's own
// constraint: the tool proposes, the human writes.

export const MAX_TOUCHES = 3;

// Touch 1 → day 0, touch 2 → day 4, touch 3 → day 11, dead on day 18.
// Index by the touch just sent to get days until the next follow-up is due
// (null = no further touches; the thread closes after DEAD_AFTER_DAYS).
export const FOLLOW_UP_GAP_DAYS: Record<number, number | null> = {
  1: 4,
  2: 7,
  3: null,
};
export const DEAD_AFTER_LAST_TOUCH_DAYS = 7;

export const EMAIL_WORD_BAND: [number, number] = [150, 199];
export const LINKEDIN_WORD_BAND: [number, number] = [50, 200];
export const SUBJECT_WORD_BAND: [number, number] = [5, 6];

// Minimum % of the final body that must differ from the AI proposal before
// the send button lights up. Edit distance over final length, so 100 means
// nothing of the proposal survived. Deliberately high: the tool's job is the
// blank page and the research recall, not the message.
export const HUMAN_EDIT_FLOOR_PCT = 60;

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function containsFirstName(body: string, fullName: string): boolean {
  const first = fullName.trim().split(/\s+/)[0];
  if (!first) return false;
  return new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(body);
}

// Levenshtein distance with a single rolling row — bodies are ≤ a few
// hundred words, so O(n·m) is fine.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

// % of the final body the human actually wrote, computed as edit distance
// from the AI proposal over the final length, capped at 100.
export function humanEditedPct(aiDraft: string, finalBody: string): number {
  const final = finalBody.trim();
  if (!final) return 0;
  const dist = editDistance(aiDraft.trim(), final);
  return Math.min(100, Math.round((dist / final.length) * 100));
}

// Per-channel plus-alias so every inbound is attributable without asking.
// areef@gmail.com + channel "em" + "Acme Corp" → areef+em-acme-corp@gmail.com
export function channelAlias(
  email: string,
  channel: "em" | "ln",
  companyName: string | null,
): string | null {
  const at = email.indexOf("@");
  if (at <= 0) return null;
  const slug = (companyName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  const tag = slug ? `${channel}-${slug}` : channel;
  return `${email.slice(0, at)}+${tag}${email.slice(at)}`;
}
