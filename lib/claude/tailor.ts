import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_PREMIUM } from "@/lib/claude/client";
import type { JobForScoring } from "@/lib/claude/score";

const TailorResult = z.object({
  bullets: z.array(z.string()),
  cover_letter: z.string(),
});

const RULES = `You tailor application materials for one specific candidate applying to one specific job.

HARD RULE — never fabricate. Every claim must come from the candidate's profile text. Re-angle, re-order, and re-word what the profile states; never invent metrics, employers, titles, technologies, or outcomes. If the job wants something the profile doesn't show, leave it out — a gap is handled by omission, not invention.

bullets: 3–5 resume bullets, each ≤ 28 words, strongest first. Rewrite the candidate's actual experience in the vocabulary of THIS job description (mirror its key terms where honest). Action verb first; keep any numbers exactly as the profile states them.

cover_letter: 180–220 words, plain text. Structure: one line naming the role and a specific, credible reason this company/role fits the candidate (drawn from the JD — not generic praise); one short paragraph connecting 2–3 profile facts to the job's stated needs; one closing line with a low-key ask. No "I am writing to express", no flattery boilerplate, no restating the resume. Write like a person.`;

export type TailorOutcome = {
  bullets: string[];
  coverLetter: string;
  tokens: { input: number; output: number };
};

export async function tailorJob(
  profile: string,
  job: JobForScoring,
): Promise<TailorOutcome> {
  const response = await getClient().messages.parse({
    model: MODEL_PREMIUM,
    max_tokens: 12_000,
    // Opus 4.8 runs WITHOUT thinking when the field is omitted — set it.
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: RULES },
      {
        type: "text",
        text: `CANDIDATE PROFILE:\n\n${profile}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `JOB\nTitle: ${job.title}\nCompany: ${job.companyName}\nLocation: ${job.location ?? "unspecified"}\n\nDESCRIPTION:\n${job.description.slice(0, 12_000)}`,
      },
    ],
    output_config: { format: zodOutputFormat(TailorResult) },
  });

  if (!response.parsed_output) {
    throw new Error(`Tailoring failed (stop_reason: ${response.stop_reason})`);
  }
  return {
    bullets: response.parsed_output.bullets.slice(0, 5),
    coverLetter: response.parsed_output.cover_letter,
    tokens: {
      input:
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
      output: response.usage.output_tokens,
    },
  };
}
