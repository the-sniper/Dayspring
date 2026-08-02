// Screening-question answer memory (the Jobright/Simplify "answer bank").
// Questions are matched across companies two ways: by normalized text, so
// "Will you require Visa Sponsorship now, or in the future?*" matches the same
// question elsewhere despite whitespace/required-marker differences, and by
// meaning class (lib/apply/answer-class.ts), so differently-worded versions of
// the same question share one answer.
//
// Answers about a specific employer are banked but never auto-filled anywhere
// else — see isReusableAnswer.
import {
  classifyQuestion,
  isReusableAnswer,
  type AnswerClass,
} from "@/lib/apply/answer-class";
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

export type SavedAnswers = {
  // Exact normalized-text match — highest confidence, tried first.
  byKey: Map<string, string>;
  // Meaning-class match, for questions worded differently than last time.
  // "other" is never indexed here: it is the bucket for questions we could not
  // identify, so a class match on it would mean "some unidentified question
  // matched some other unidentified question", which is not a match at all.
  byClass: Map<AnswerClass, string>;
};

export const EMPTY_SAVED_ANSWERS: SavedAnswers = {
  byKey: new Map(),
  byClass: new Map(),
};

// Only reusable answers are loaded for filling. Non-reusable ones stay in the
// bank for display and editing, but never auto-fill at another company.
export async function loadSavedAnswers(): Promise<SavedAnswers> {
  try {
    const rows = await convex().query(api.applyAnswers.list, {});
    const byKey = new Map<string, string>();
    const byClass = new Map<AnswerClass, string>();
    for (const r of rows) {
      // Legacy rows predate both columns. Recompute rather than trusting a
      // missing value, so old essay answers stop being replayed immediately
      // instead of waiting to be re-banked.
      const cls = (r.qclass as AnswerClass | undefined) ?? classifyQuestion(r.question);
      const reusable = r.reusable ?? isReusableAnswer(r.question, r.answer, cls);
      if (!reusable) continue;
      byKey.set(r.key, r.answer);
      // First write wins; prefer a stable earlier answer over thrashing on a
      // one-off rewording.
      if (cls !== "other" && !byClass.has(cls)) byClass.set(cls, r.answer);
    }
    return { byKey, byClass };
  } catch {
    return EMPTY_SAVED_ANSWERS;
  }
}

// Look up one field label. Exact text beats class; class beats nothing.
export function lookupAnswer(
  saved: SavedAnswers,
  label: string,
): { answer: string; via: "exact" | "class" } | null {
  const exact = saved.byKey.get(normalizeQuestion(label));
  if (exact) return { answer: exact, via: "exact" };
  const cls = classifyQuestion(label);
  if (cls === "other") return null;
  const fromClass = saved.byClass.get(cls);
  return fromClass ? { answer: fromClass, via: "class" } : null;
}

export async function saveAnswers(
  pairs: { label: string; value: string }[],
): Promise<number> {
  let saved = 0;
  for (const p of pairs) {
    if (!p.value.trim() || !isBankableQuestion(p.label)) continue;
    const key = normalizeQuestion(p.label);
    if (!key) continue;
    const qclass = classifyQuestion(p.label);
    try {
      await convex().mutation(api.applyAnswers.upsert, {
        key,
        question: p.label.trim(),
        answer: p.value.trim(),
        qclass,
        reusable: isReusableAnswer(p.label, p.value, qclass),
      });
      saved++;
    } catch {
      // best-effort — memory is a convenience, not a requirement
    }
  }
  return saved;
}
