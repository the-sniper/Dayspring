// Screening-question answer memory (the Jobright/Simplify "answer bank").
// Questions are matched across companies by normalized text, so "Will you
// require Visa Sponsorship now, or in the future?*" on one board matches the
// same question elsewhere despite whitespace/required-marker differences.
import { api, convex } from "@/lib/convex/server";

export function normalizeQuestion(label: string): string {
  return label
    .toLowerCase()
    .replace(/\(mark all that apply\)|\(optional\)|\(required\)/g, "")
    .replace(/[*✱]|\s*required\s*$/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

// Contact basics are profile data, not "answers" — never bank them. EEO/
// demographic answers are never banked either (they stay a per-form human
// decision, matching the never-auto-answer rule).
const CONTACT_RX =
  /first name|last name|full name|^name$|email|phone|resume|cover letter|linkedin|github|website|portfolio|country code/i;
const EEO_RX =
  /gender|race|ethnic|veteran|disab|sexual orientation|lgbt|pronoun|transgender|self[- ]?identif|demographic/i;

export function isBankableQuestion(label: string): boolean {
  const l = label.trim();
  if (l.length < 8) return false;
  if (CONTACT_RX.test(l) || EEO_RX.test(l)) return false;
  return true;
}

export async function loadSavedAnswers(): Promise<Map<string, string>> {
  try {
    const rows = await convex().query(api.applyAnswers.list, {});
    return new Map(rows.map((r) => [r.key, r.answer]));
  } catch {
    return new Map();
  }
}

export async function saveAnswers(
  pairs: { label: string; value: string }[],
): Promise<number> {
  let saved = 0;
  for (const p of pairs) {
    if (!p.value.trim() || !isBankableQuestion(p.label)) continue;
    const key = normalizeQuestion(p.label);
    if (!key) continue;
    try {
      await convex().mutation(api.applyAnswers.upsert, {
        key,
        question: p.label.trim(),
        answer: p.value.trim(),
      });
      saved++;
    } catch {
      // best-effort — memory is a convenience, not a requirement
    }
  }
  return saved;
}
