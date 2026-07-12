// Resume-vs-JD analyzer. Two calls: (1) analyzeMatch scores a specific resume
// against a specific job description and returns a rich critique; (2) alignResume
// regenerates an improved, ATS-safe resume that leans into the JD — still bound
// by the same "never fabricate" rules as lib/claude/resume.ts.
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_SCORE, MODEL_PREMIUM } from "@/lib/claude/client";
import { ResumeDoc, type ResumeDocType } from "@/lib/claude/resume";

// ── 1. Analyze ───────────────────────────────────────────────────────────────

const MatchRow = z.object({
  label: z.string(), // e.g. "Job Title", "Years of Experience", "Industry", "Summary"
  job_value: z.string(), // what the JD asks for (short)
  resume_value: z.string(), // what the resume shows (short)
  status: z.enum(["match", "warn", "miss"]),
});

const AtsCheck = z.object({
  label: z.string(), // "Hard skills", "Job title", "Education", "Soft skills", "Terminology"
  status: z.enum(["pass", "warn", "fail"]),
  note: z.string(), // short, actionable (name the missing items)
});

const MatchResult = z.object({
  score: z.number(), // 0–100 — experience/qualification FIT (partly immovable)
  ats_score: z.number(), // 0–100 — searchability/keyword alignment (fully editable)
  ats_checks: z.array(AtsCheck),
  fit_summary: z.string(),
  rows: z.array(MatchRow),
  keywords: z.object({
    matched: z.array(z.string()), // JD skills/tools present in the resume
    missing: z.array(z.string()), // JD skills/tools absent from the resume
  }),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  improvements: z.array(z.string()),
});

export type MatchStatus = "match" | "warn" | "miss";

export type MatchRowT = {
  label: string;
  jobValue: string;
  resumeValue: string;
  status: MatchStatus;
};

export type AtsCheckT = {
  label: string;
  status: "pass" | "warn" | "fail";
  note: string;
};

export type MatchAnalysis = {
  score: number; // 0–100 — experience fit (partly immovable)
  atsScore: number; // 0–100 — searchability (fully editable, target 85+)
  atsChecks: AtsCheckT[];
  fitSummary: string;
  rows: MatchRowT[];
  keywords: { matched: string[]; missing: string[] };
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
};

const ANALYZE_RUBRIC = `You are an exacting resume reviewer. Given one candidate's RESUME and one target JOB DESCRIPTION, produce TWO separate scores plus a critique. Keeping them separate matters: one measures things the candidate can fix by editing the resume, the other measures their actual background.

score (FIT, 0–100) — how qualified this candidate genuinely is for THIS job. Calibrated strictly so scores are comparable across jobs:
- 85–100: excellent — clearly qualified; requirements, seniority, and experience line up
- 70–84: good — a strong candidate with minor gaps
- 50–69: fair — meaningful gaps; likely a stretch
- 0–49: poor — wrong role/seniority or most must-haves are missing

ats_score (SEARCHABILITY, 0–100) — how well THIS resume text would surface in recruiter keyword searches and ATS ranking for THIS job, judged ONLY on controllable resume-writing factors (never on whether the candidate is qualified). Weight like commercial ATS scanners (hard skills heaviest, then job title, education presentation, soft skills, terminology):
- Hard-skill keyword coverage (heaviest): fraction of the JD's hard skills/tools/technologies that appear in the resume, using the JD's exact strings. Coverage of ~80% of the JD's hard skills ≈ 85–90 here; do NOT demand 100% — beyond ~85–90% coverage looks like stuffing.
- Job title: EXACT posted title present in headline/summary = full credit; near-title = partial; absent = heavy penalty.
- Education presentation: if the JD names a degree/certification the resume HAS, is it stated in matching terms? (If the candidate lacks it, that penalizes fit, NOT ats_score.) A HIGHER OR EQUIVALENT degree fully satisfies a lower requirement — a Master's (or PhD) satisfies a "Bachelor's required" JD; never flag a Bachelor's as "missing" when a higher degree in a relevant field is present. Only warn/fail if the field is unrelated or no qualifying degree exists.
- Soft skills named in the JD that the resume evidences.
- Terminology mechanics: acronyms spelled out once with short form, consistent "Mon YYYY" dates, keywords present in summary + skills + first bullets (not only in a skills dump), quantified results.
A resume that mirrors the JD's language well should score 85+ even if the candidate is underqualified. Never let fit leak into ats_score.

ats_checks: exactly five rows, labels in this order: "Hard skills", "Job title", "Education", "Soft skills", "Terminology". status: "pass" (fully covered), "warn" (partial), "fail" (mostly missing). note: one short actionable line naming the specific missing/wrong items (e.g. 'Missing: Terraform, GraphQL' or 'Headline says "Software Engineer", posting says "Senior Software Engineer"').

rows: produce ONE row for each of these labels, in this order: "Job Title", "Years of Experience", "Industry", "Summary".
- job_value = what the JD asks for (short phrase). resume_value = what the resume shows (short phrase, or "Not stated").
- status: "match" if the resume clearly satisfies it, "warn" if partial/unclear, "miss" if absent or misaligned.
- "Job Title" is strict: "match" ONLY if the resume's headline/summary contains the EXACT posted job title, character-for-character. A synonym or near-title ("Product Lead" vs "Senior Product Manager") is "warn"; nothing comparable is "miss". ATS title matching is literal, and exact-title resumes get ~10x the callbacks.

keywords: extract the concrete hard skills, tools, technologies, and named methodologies from the JD (not soft skills or filler). Put each into "matched" if the resume evidences it (allow honest synonyms: JD "React.js" vs resume "React"), otherwise "missing".

strengths: up to 5 short phrases on what makes this resume compelling for the job.
weaknesses: up to 5 short phrases on the biggest problems or gaps for this job. Mark experience gaps that editing cannot fix as such.
improvements: up to 6 short, concrete, actionable EDITS to the resume text, ordered by ats_score impact (hard-skill keywords first, then exact title, then terminology mechanics). Each must be executable without new facts (e.g. "Add a Summary that names the target role and top 3 matching skills", "Quantify the API work with latency/throughput numbers", "Surface Kubernetes in Skills if you've used it"). Never suggest inventing experience.

Hard rule: judge ONLY from the resume text provided. Never assume skills or experience the resume does not state; missing information is a gap, not a benefit of the doubt. One exception, applied to BOTH scores: a higher or equivalent credential satisfies a lower requirement (a Master's satisfies "Bachelor's required"; senior experience satisfies a "3+ years" ask) — do not penalize a candidate for exceeding a stated minimum.`;

function sumTokens(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}) {
  return {
    input:
      usage.input_tokens +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0),
    output: usage.output_tokens,
  };
}

export async function analyzeMatch(
  resumeText: string,
  jd: string,
): Promise<{ analysis: MatchAnalysis; tokens: { input: number; output: number } }> {
  let response;
  try {
    response = await getClient().messages.parse({
      model: MODEL_SCORE,
      max_tokens: 16_000, // headroom for reasoning + the JSON (two scores + checks); too low truncates the JSON mid-string
      system: [
        { type: "text", text: ANALYZE_RUBRIC },
        {
          type: "text",
          text: `CANDIDATE RESUME:\n\n${resumeText.slice(0, 20_000)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        { role: "user", content: `JOB DESCRIPTION:\n\n${jd.slice(0, 12_000)}` },
      ],
      output_config: { format: zodOutputFormat(MatchResult) },
    });
  } catch (err) {
    // The SDK parses the model's text as JSON; a truncated response (hit
    // max_tokens mid-string) surfaces here as an opaque "Unterminated string"
    // parse error. Translate it into something the user can act on.
    const msg = err instanceof Error ? err.message : String(err);
    if (/Unterminated string|Failed to parse structured output/i.test(msg)) {
      throw new Error(
        "The analysis response was too long to complete. Try a shorter job description or resume, then run it again.",
      );
    }
    throw err;
  }

  if (!response.parsed_output) {
    throw new Error(`Resume match analysis failed (stop_reason: ${response.stop_reason})`);
  }
  const r = response.parsed_output;
  const analysis: MatchAnalysis = {
    score: Math.max(0, Math.min(100, Math.round(r.score))),
    atsScore: Math.max(0, Math.min(100, Math.round(r.ats_score))),
    atsChecks: r.ats_checks.slice(0, 5),
    fitSummary: r.fit_summary,
    rows: r.rows.map((row) => ({
      label: row.label,
      jobValue: row.job_value,
      resumeValue: row.resume_value,
      status: row.status,
    })),
    keywords: {
      matched: r.keywords.matched,
      missing: r.keywords.missing,
    },
    strengths: r.strengths.slice(0, 5),
    weaknesses: r.weaknesses.slice(0, 5),
    improvements: r.improvements.slice(0, 6),
  };
  return { analysis, tokens: sumTokens(response.usage) };
}

// ── 2. Align (regenerate) ────────────────────────────────────────────────────

const ALIGN_RULES = `You rewrite ONE candidate's resume to be better aligned with ONE target job, producing a one-page, ATS-optimized structured resume.

SOURCE OF TRUTH: the SOURCE RESUME below. You may SELECT, REORDER, REPHRASE, and sharpen what it states — nothing else exists.

HARD RULES — never fabricate:
- Never invent an employer, title, date, degree, certification, metric, or skill. Numbers appear exactly as the source states them.
- Contact details (name, email, phone, location, links) come verbatim from the source.
- Mirror the job description's vocabulary ONLY where honest (source says "React", JD says "React.js" → fine; source lacks Kubernetes → it does NOT appear).
- If the JD wants something the source does not show, handle the gap by omission — never by invention.

ATS OPTIMIZATION (recruiters find resumes via literal keyword search — these rules decide whether the resume surfaces at all):
- headline: the EXACT job title from the posting, verbatim, character-for-character (the single highest-impact ATS factor). This is target positioning, not an employment claim — titles inside Work Experience stay exactly as the source states them.
- summary: must contain the exact posted job title once, plus the top matching skills.
- Weave 25–35 role-specific keywords lifted VERBATIM from the job description across the resume — the JD's exact strings, not synonyms or paraphrases ("Adobe Creative Cloud" ≠ "Adobe Creative Suite"). Only keywords the source honestly supports. Fewer than 25 misses recruiter searches; more than 35 trips stuffing detectors.
- HARD SKILLS are weighted heaviest by every ATS ranker: cover as many of the JD's hard skills/tools/technologies as the source honestly supports (aim for ~80% of them), and show each in an evidence bullet with a result — not only in the Skills list. A keyword that appears only in a skills dump ranks worse than one backed by a quantified bullet.
- Keyword placement is weighted: put the highest-priority JD terms in the summary, in the FIRST bullet under each role, and in the Skills section.
- Spell out each acronym once with its short form — "Search Engine Optimization (SEO)" — so both search variants match.
- Dates: normalize EVERY date to "Mon YYYY" format ("Jan 2020 – Mar 2023"); use "Present" for current roles (never "Current" or "Ongoing"). Values still come from the source — only the format is normalized. Inconsistent formats make ATS miscalculate years of experience.
- No icons, emojis, or decorative characters in any field — plain text only.

SHAPE (target ONE page):
- summary: 2–3 lines positioning the candidate for THIS role using only source facts. No fluff, no first person.
- experience: the 3–4 most relevant roles, strongest bullets first, ≤ 28 words each, action verb first; rephrase to foreground JD-relevant impact.
- skills: only skills present in the source, grouped sensibly, ordered by relevance to the JD.
- projects: include only if genuinely relevant and space allows (0–2).
- education: keep brief.
- tailoring_note: one sentence on what you emphasized and why.

The user may ask you to prioritize certain sections and to surface certain JD keywords — do so only where the source genuinely supports them.`;

export type AlignOptions = {
  sections: string[]; // e.g. ["Summary","Skills","Work Experience","Projects"]
  keywords: string[]; // JD keywords the user wants surfaced (only if truthful)
  title?: string | null; // optional target title
};

export async function alignResume(
  resumeText: string,
  jd: string,
  opts: AlignOptions,
): Promise<{ doc: ResumeDocType; tokens: { input: number; output: number } }> {
  const focus = opts.sections.length
    ? `\n\nSECTIONS TO PRIORITIZE ENHANCING: ${opts.sections.join(", ")}.`
    : "";
  const kw = opts.keywords.length
    ? `\n\nSURFACE THESE JD KEYWORDS where the source resume genuinely supports them (never invent): ${opts.keywords.join(", ")}.`
    : "";

  const response = await getClient().messages.parse({
    model: MODEL_PREMIUM,
    max_tokens: 16_000,
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: ALIGN_RULES },
      {
        type: "text",
        text: `SOURCE RESUME:\n\n${resumeText.slice(0, 60_000)}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `TARGET JOB${opts.title ? `\nEXACT TARGET TITLE (mirror verbatim in headline and summary): ${opts.title}` : ""}\n\nDESCRIPTION:\n${jd.slice(0, 12_000)}${focus}${kw}`,
      },
    ],
    output_config: { format: zodOutputFormat(ResumeDoc) },
  });

  if (!response.parsed_output) {
    throw new Error(`Resume alignment failed (stop_reason: ${response.stop_reason})`);
  }
  return { doc: response.parsed_output, tokens: sumTokens(response.usage) };
}
