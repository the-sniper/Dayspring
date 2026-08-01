import { z } from "zod";
import { HUMAN_MESSAGE_VOICE, sanitizeAiProse } from "@/lib/ai/human-message";
import { structuredComplete } from "@/lib/ai/complete";
import type { JobForScoring } from "@/lib/claude/score";

const TailorResult = z.object({
  bullets: z.array(z.string()),
  cover_letter: z.string(),
});

const RULES = `You tailor application materials for one specific candidate applying to one specific job.

HARD RULE - never fabricate. Every claim must come from the candidate's profile text. Re-angle, re-order, and re-word what the profile states; never invent metrics, employers, titles, technologies, or outcomes. If the job wants something the profile doesn't show, leave it out. A gap is handled by omission, not invention.

bullets: 3–5 resume bullets, each ≤ 28 words, strongest first. Rewrite the candidate's actual experience in the vocabulary of THIS job description (mirror its key terms where honest). Action verb first; keep any numbers exactly as the profile states them.

cover_letter: 180–220 words, plain text.
${HUMAN_MESSAGE_VOICE}
Structure: one line naming the role and a specific, credible reason this company/role fits the candidate (drawn from the JD, not generic praise); one short paragraph connecting 2–3 profile facts to the job's stated needs; one closing line with a low-key ask. No "I am writing to express", no flattery boilerplate, no restating the resume.`;
export type TailorOutcome = {
  bullets: string[];
  coverLetter: string;
  tokens: { input: number; output: number };
};

export async function tailorJob(
  profile: string,
  job: JobForScoring,
  brief?: string | null,
): Promise<TailorOutcome> {
  // Research brief (if any) rides in the user turn — real, current company
  // facts to reference — NOT the cached profile prefix. Never override the
  // never-fabricate rule: the brief bounds what's true about the company.
  const briefBlock = brief
    ? `\n\nCOMPANY RESEARCH (accurate facts about the employer — you may reference these; do not invent beyond them):\n${brief.slice(0, 4000)}`
    : "";
  const { data, usage } = await structuredComplete({
    tier: "premium",
    schema: TailorResult,
    schemaName: "tailored_materials",
    maxTokens: 12_000,
    system: RULES,
    cache: `CANDIDATE PROFILE:\n\n${profile}`,
    user: `JOB\nTitle: ${job.title}\nCompany: ${job.companyName}\nLocation: ${job.location ?? "unspecified"}\n\nDESCRIPTION:\n${job.description.slice(0, 12_000)}${briefBlock}`,
  });

  return {
    bullets: data.bullets.slice(0, 5).map(sanitizeAiProse),
    coverLetter: sanitizeAiProse(data.cover_letter),
    tokens: usage,
  };
}
