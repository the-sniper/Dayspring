import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";

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
  const { data: raw, usage } = await structuredComplete({
    tier: "standard",
    schema: ScoreResult,
    schemaName: "job_score",
    maxTokens: 6000, // room for reasoning + the JSON
    system: RUBRIC,
    // Stable across a batch run — cached prefix on both providers.
    cache: `CANDIDATE PROFILE:\n\n${profile}`,
    user: `JOB\nTitle: ${job.title}\nCompany: ${job.companyName}\nLocation: ${job.location ?? "unspecified"}\n\nDESCRIPTION:\n${jd}`,
  });

  return {
    score: Math.max(0, Math.min(100, Math.round(raw.score))),
    fitSummary: raw.fit_summary,
    gaps: raw.gaps.slice(0, 6),
    tokens: usage,
  };
}
