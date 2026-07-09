import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
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
  const response = await getClient().messages.create({
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
  const response = await getClient().messages.parse({
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

const ResumeDoc = z.object({
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
      dates: z.string(), // verbatim from master
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

const GENERATE_RULES = `You build a one-page tailored resume for one candidate applying to one specific job.

SOURCE OF TRUTH: the MASTER RESUME(S) below. You may SELECT, REORDER, and REPHRASE what they state — nothing else exists.

HARD RULES — never fabricate:
- Never invent an employer, title, date, degree, certification, metric, or skill. Numbers appear exactly as a master states them.
- Contact details (name, email, phone, location, links) come verbatim from the masters.
- Mirror the job description's vocabulary only where honest (master says "React", JD says "React.js" → fine; master lacks Kubernetes → it does NOT appear).
- If the JD wants something no master shows, handle the gap by omission — never by invention.
- If the same role appears in multiple masters with different bullets, pick the strongest truthful set for THIS job.

SELECTION & SHAPE (target ONE page):
- experience: the 3–4 most relevant roles, newest first unless relevance clearly dictates otherwise; 2–4 bullets each, ≤ 28 words, action verb first, strongest first.
- skills: only skills present in masters, grouped sensibly, groups ordered by relevance to the JD.
- projects: include only if genuinely relevant and space allows (0–2).
- summary: 2–3 lines positioning the candidate for THIS role using only master facts. No fluff ("results-driven"), no first person.
- headline: a short role label the masters support (e.g. their actual current title or field).
- education: keep brief.
- tailoring_note: one sentence on what you emphasized and why (e.g. "Led with the ML platform work to match the JD's focus on model serving.").`;

export type ResumeGenOutcome = {
  doc: ResumeDocType;
  tokens: { input: number; output: number };
};

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

  const response = await getClient().messages.parse({
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
        content: `JOB\nTitle: ${job.title}\nCompany: ${job.companyName}\nLocation: ${job.location ?? "unspecified"}\n\nDESCRIPTION:\n${job.description.slice(0, 12_000)}${briefBlock}`,
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
