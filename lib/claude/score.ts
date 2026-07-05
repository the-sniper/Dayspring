import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_SCORE } from "@/lib/claude/client";

// Plain number — the API strips numeric constraints from wire schemas anyway;
// we clamp/round in code as belt-and-braces.
const ScoreResult = z.object({
  score: z.number(),
  fit_summary: z.string(),
  gaps: z.array(z.string()),
});

// Stable rubric first (cacheable prefix), volatile JD in the user turn.
const RUBRIC = `You are an exacting job-match evaluator working for one specific candidate. Score how well a job posting fits THIS candidate.

Score bands (calibrate strictly so scores are comparable across jobs):
- 85–100: apply now — role type, must-haves, seniority, and constraints all line up
- 70–84: strong — worth pursuing, minor gaps
- 50–69: stretch — meaningful gaps but plausible
- 0–49: skip — wrong role type, seniority, or hard constraint violated

Criteria, in order of weight:
1. Role-type alignment with the candidate's stated targets
2. Must-have requirement coverage from the candidate's actual experience
3. Seniority match (both under- and over-leveled score down)
4. Location / visa / work-authorization constraints the candidate states

Hard rule: judge ONLY from the profile text provided. Never assume or invent skills, experience, or flexibility the candidate does not state. Missing information is a gap, not a benefit of the doubt.

Output: score per the bands; fit_summary = 1–2 plain sentences on why this fits or doesn't; gaps = up to 6 short phrases naming the biggest missing requirements (empty if none).`;

export type JobForScoring = {
  title: string;
  companyName: string;
  location: string | null;
  description: string;
};

export type ScoreOutcome = {
  score: number;
  fitSummary: string;
  gaps: string[];
  tokens: { input: number; output: number };
};

export async function scoreJob(
  profile: string,
  job: JobForScoring,
): Promise<ScoreOutcome> {
  const jd = job.description.slice(0, 12_000);
  const response = await getClient().messages.parse({
    model: MODEL_SCORE,
    max_tokens: 6000, // room for adaptive thinking + the JSON
    system: [
      { type: "text", text: RUBRIC },
      {
        type: "text",
        text: `CANDIDATE PROFILE:\n\n${profile}`,
        // Batch runs re-read the profile at ~0.1x. No-op if below the
        // model's minimum cacheable prefix — harmless either way.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `JOB\nTitle: ${job.title}\nCompany: ${job.companyName}\nLocation: ${job.location ?? "unspecified"}\n\nDESCRIPTION:\n${jd}`,
      },
    ],
    output_config: { format: zodOutputFormat(ScoreResult) },
  });

  if (!response.parsed_output) {
    throw new Error(`Scoring failed (stop_reason: ${response.stop_reason})`);
  }
  const raw = response.parsed_output;
  return {
    score: Math.max(0, Math.min(100, Math.round(raw.score))),
    fitSummary: raw.fit_summary,
    gaps: raw.gaps.slice(0, 6),
    tokens: {
      input: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
      output: response.usage.output_tokens,
    },
  };
}
