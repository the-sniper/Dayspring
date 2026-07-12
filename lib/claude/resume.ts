import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";
import { getClient, MODEL_PREMIUM } from "@/lib/claude/client";

// ── 1. Master-resume ingestion (verified) ────────────────────────────────────
// The transcription is the SOURCE OF TRUTH for scoring, tailoring, and every
// generated application resume — so it gets the full treatment: an Opus
// extraction with extended thinking, then an adversarial fidelity audit
// against the original PDF, then one repair round if anything was lost or
// altered. Extraction ONLY — nothing may be added, inferred, or dropped.

const EXTRACT_RULES = `You transcribe a resume PDF into clean, complete markdown. This transcription becomes the source of truth for job scoring, tailoring, and generated application resumes — fidelity is everything.

VERBATIM RULES:
- Transcribe EVERY fact: every employer, job title, date range, location, degree, certification, bullet, skill, tool, metric, award, publication, and link. Numbers character-for-character ("$1.2M", "p95 < 180ms", "3+ years").
- Preserve the document's own section structure and ordering (# for the name, ## for section headings, - for bullets).
- Multi-column layouts: read each column fully and in order; never interleave columns into nonsense. Render tables as "Label: value" lines or bullets.
- Fix ONLY mechanical layout artifacts: mid-sentence line wraps, hyphenation splits, repeated page headers/footers, page numbers.
- Links: transcribe URLs exactly as printed. If only anchor text or a truncated URL is visible, transcribe what is visible — NEVER guess or complete a URL.
- Do NOT add, infer, summarize, reword, reorder, or omit ANYTHING. No commentary, no code fences.

Output ONLY the markdown.`;

const ExtractionAudit = z.object({
  // Facts in the PDF that are absent from the markdown — quote each.
  missing: z.array(z.string()),
  // Facts transcribed incorrectly — quote "PDF says … / markdown says …".
  altered: z.array(z.string()),
  faithful: z.boolean(), // true ONLY if missing and altered are both empty
});

const AUDIT_RULES = `You audit a resume transcription for fidelity. The PDF is ground truth; the markdown claims to transcribe it.

- missing: any fact in the PDF absent from the markdown — a lost bullet, skill, date, metric, link, certification, or section. Quote the missing fact.
- altered: any fact transcribed incorrectly — changed numbers/dates/titles/names, or rewording that shifts meaning. Quote both versions.
- IGNORE pure formatting differences: heading levels, bullet glyphs, line breaks, section ordering that matches a multi-column reading, and mechanical layout-artifact fixes.
- Be exhaustive. A single lost bullet or one changed number means faithful=false.`;

function pdfBlock(pdfBase64: string) {
  return {
    type: "document" as const,
    source: {
      type: "base64" as const,
      media_type: "application/pdf" as const,
      data: pdfBase64,
    },
  };
}

async function extractOnce(
  pdfBase64: string,
  repairNotes?: string[],
): Promise<string> {
  const instruction = repairNotes?.length
    ? `A previous transcription of this resume had fidelity problems:\n${repairNotes
        .map((p) => `- ${p}`)
        .join(
          "\n",
        )}\n\nProduce the corrected, COMPLETE transcription of the whole resume.`
    : "Transcribe this resume into markdown.";
  const response = await (await getClient()).messages.create({
    model: MODEL_PREMIUM,
    max_tokens: 16_000,
    thinking: { type: "adaptive" },
    system: EXTRACT_RULES,
    messages: [
      { role: "user", content: [pdfBlock(pdfBase64), { type: "text", text: instruction }] },
    ],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Couldn't read any text out of that PDF.");
  return text;
}

async function auditExtraction(
  pdfBase64: string,
  markdown: string,
): Promise<z.infer<typeof ExtractionAudit>> {
  const response = await (await getClient()).messages.parse({
    model: MODEL_PREMIUM,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: AUDIT_RULES,
    messages: [
      {
        role: "user",
        content: [
          pdfBlock(pdfBase64),
          { type: "text", text: `MARKDOWN TRANSCRIPTION TO AUDIT:\n\n${markdown}` },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractionAudit) },
  });
  if (!response.parsed_output) {
    throw new Error(`Extraction audit failed (stop: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

export type ParsedResume = {
  markdown: string;
  faithful: boolean; // did the final audit come back clean?
  problems: string[]; // outstanding audit findings, if any
  passes: number; // extraction rounds run (1 = clean first try, 2 = repaired)
};

// Extract → audit → (repair → re-audit) once. Never loops further: residual
// findings are surfaced to the human, who can view & edit the parse directly.
export async function extractResumeVerified(
  pdfBase64: string,
): Promise<ParsedResume> {
  let markdown = await extractOnce(pdfBase64);
  let audit = await auditExtraction(pdfBase64, markdown);
  let passes = 1;

  const problems = () => [
    ...audit.missing.map((m) => `missing: ${m}`),
    ...audit.altered.map((a) => `altered: ${a}`),
  ];

  if (!audit.faithful && problems().length > 0) {
    markdown = await extractOnce(pdfBase64, problems());
    audit = await auditExtraction(pdfBase64, markdown);
    passes = 2;
  }

  return { markdown, faithful: audit.faithful, problems: problems(), passes };
}

// ── 2. Per-JD resume generation ──────────────────────────────────────────────
// Structured resume document — rendered to an ATS-safe PDF by
// lib/resumes/render.ts. All content must come from the master corpus.

export const ResumeDoc = z.object({
  name: z.string(),
  contact: z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    linkedin: z.string().nullable(),
    website: z.string().nullable(),
  }),
  headline: z.string().nullable(), // e.g. "Full-Stack Engineer" — from master facts
  summary: z.string().nullable(), // 2–3 lines positioning for THIS job
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string().nullable(),
      // Values from the master, format normalized to "Mon YYYY – Mon YYYY"
      // (or "Present") so ATS date math works.
      dates: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      blurb: z.string().nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string().nullable(),
      dates: z.string().nullable(),
      detail: z.string().nullable(),
    }),
  ),
  // One line for the UI (never rendered into the PDF): what was emphasized.
  tailoring_note: z.string(),
});

export type ResumeDocType = z.infer<typeof ResumeDoc>;

const GENERATE_RULES = `You build a one-page, ATS-optimized tailored resume for one candidate applying to one specific job.

SOURCE OF TRUTH: the MASTER RESUME(S) below. You may SELECT, REORDER, and REPHRASE what they state — nothing else exists.

HARD RULES — never fabricate:
- Never invent an employer, title, date, degree, certification, metric, or skill. Numbers appear exactly as a master states them.
- Contact details (name, email, phone, location, links) come verbatim from the masters.
- Mirror the job description's vocabulary only where honest (master says "React", JD says "React.js" → fine; master lacks Kubernetes → it does NOT appear).
- If the JD wants something no master shows, handle the gap by omission — never by invention.
- If the same role appears in multiple masters with different bullets, pick the strongest truthful set for THIS job.

ATS OPTIMIZATION (recruiters find resumes via literal keyword search — these rules decide whether the resume surfaces at all):
- headline: the EXACT job title from the posting, verbatim, character-for-character (the single highest-impact ATS factor). This is target positioning, not an employment claim — titles inside Work Experience stay exactly as the masters state them.
- summary: must contain the exact posted job title once, plus the top matching skills.
- Weave 25–35 role-specific keywords lifted VERBATIM from the job description across the resume — the JD's exact strings, not synonyms or paraphrases ("Adobe Creative Cloud" ≠ "Adobe Creative Suite"). Only keywords the masters honestly support. Fewer than 25 misses recruiter searches; more than 35 trips stuffing detectors.
- Keyword placement is weighted: put the highest-priority JD terms in the summary, in the FIRST bullet under each role, and in the Skills section.
- Spell out each acronym once with its short form — "Search Engine Optimization (SEO)" — so both search variants match.
- Dates: normalize EVERY date to "Mon YYYY" format ("Jan 2020 – Mar 2023"); use "Present" for current roles (never "Current" or "Ongoing"). Values still come from the masters — only the format is normalized. Inconsistent formats make ATS miscalculate years of experience.
- No icons, emojis, or decorative characters in any field — plain text only.

SELECTION & SHAPE (target ONE page):
- experience: the 3–4 most relevant roles, newest first unless relevance clearly dictates otherwise; 2–4 bullets each, ≤ 28 words, action verb first, strongest first.
- skills: only skills present in masters, grouped sensibly, groups ordered by relevance to the JD.
- projects: include only if genuinely relevant and space allows (0–2).
- summary: 2–3 lines positioning the candidate for THIS role using only master facts. No fluff ("results-driven"), no first person.
- education: keep brief.
- tailoring_note: one sentence on what you emphasized and why (e.g. "Led with the ML platform work to match the JD's focus on model serving.").`;

export type ResumeGenOutcome = {
  doc: ResumeDocType;
  tokens: { input: number; output: number };
};

// ── 3. Edit-with-AI (studio) ─────────────────────────────────────────────────
// Applies one user instruction to an existing structured resume, under the
// same never-fabricate + ATS rules. Powers the studio's chat box and chips.

const EDIT_RULES = `You revise ONE structured resume document according to the user's instruction, and return the COMPLETE updated document.

SOURCE OF TRUTH: the SOURCE RESUME below. Everything in the output must be supported by it — you may select, reorder, rephrase, and sharpen, nothing else exists.

HARD RULES — never fabricate:
- Never invent an employer, title, date, degree, certification, metric, or skill. Numbers appear exactly as the source states them.
- Contact details stay verbatim unless the instruction explicitly changes them.
- If the instruction asks for something the source cannot support (e.g. "add Kubernetes" when the source never mentions it), do NOT comply with that part — note the refusal briefly in tailoring_note instead.

PRESERVE unless the instruction says otherwise:
- ATS optimization: exact-title headline, verbatim JD keywords, "Mon YYYY" dates, acronyms spelled out once, plain text only.
- One-page shape: bullets ≤ 28 words, action verb first.
- All content the instruction doesn't touch stays EXACTLY as-is — do not rewrite untouched sections.

tailoring_note: one sentence describing the edit you made (and anything you refused).`;

export async function editResume(input: {
  doc: ResumeDocType;
  sourceText: string;
  jd?: string | null;
  instruction: string;
}): Promise<{ doc: ResumeDocType }> {
  const jdBlock = input.jd
    ? `\n\nTARGET JOB DESCRIPTION (context for keyword choices):\n${input.jd.slice(0, 8000)}`
    : "";
  // Interactive, incremental edit — applies ONE instruction and preserves the
  // rest. Routed to the fast premium tier (OpenAI GPT-5.6 when available, Opus
  // fallback) so the studio responds in seconds, not the 1–2 min an Opus +
  // extended-thinking pass took. Full resume BUILDS (generate/align) stay on
  // Opus below, where the deeper reasoning earns its latency.
  const { data } = await structuredComplete({
    tier: "premium",
    schema: ResumeDoc,
    schemaName: "resume_edit",
    maxTokens: 16_000,
    system: EDIT_RULES,
    cache: `SOURCE RESUME:\n\n${input.sourceText.slice(0, 60_000)}`,
    user: `CURRENT RESUME DOCUMENT (JSON):\n${JSON.stringify(input.doc)}${jdBlock}\n\nINSTRUCTION:\n${input.instruction.slice(0, 2000)}`,
  });
  return { doc: data };
}

export async function generateResume(
  masters: { label: string; content: string }[],
  job: { title: string; companyName: string; location: string | null; description: string },
  brief?: string | null,
): Promise<ResumeGenOutcome> {
  const corpus = masters
    .map((m) => `=== MASTER RESUME: ${m.label} ===\n${m.content}`)
    .join("\n\n");
  const briefBlock = brief
    ? `\n\nCOMPANY RESEARCH (verified facts about the employer — context only; the resume content still comes solely from the masters):\n${brief.slice(0, 3000)}`
    : "";

  const response = await (await getClient()).messages.parse({
    model: MODEL_PREMIUM,
    max_tokens: 16_000,
    // Opus 4.8 runs WITHOUT thinking when the field is omitted — set it.
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: GENERATE_RULES },
      {
        type: "text",
        text: `MASTER RESUME CORPUS:\n\n${corpus.slice(0, 60_000)}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `JOB\nEXACT TARGET TITLE (mirror verbatim in headline and summary): ${job.title}\nCompany: ${job.companyName}\nLocation: ${job.location ?? "unspecified"}\n\nDESCRIPTION:\n${job.description.slice(0, 12_000)}${briefBlock}`,
      },
    ],
    output_config: { format: zodOutputFormat(ResumeDoc) },
  });

  if (!response.parsed_output) {
    throw new Error(`Resume generation failed (stop_reason: ${response.stop_reason})`);
  }
  return {
    doc: response.parsed_output,
    tokens: {
      input:
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
      output: response.usage.output_tokens,
    },
  };
}
