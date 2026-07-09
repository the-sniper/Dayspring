import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_CHEAP, MODEL_PREMIUM } from "@/lib/claude/client";

// ── 1. Master-resume ingestion ───────────────────────────────────────────────
// Transcribe an uploaded PDF into clean markdown. Extraction ONLY — the master
// corpus is the ground truth every generated resume is bounded by, so nothing
// may be added, inferred, or dropped here.

const EXTRACT_RULES = `Transcribe this resume into clean, well-structured markdown.

VERBATIM RULES:
- Every employer, job title, date range, degree, bullet, skill, metric, and link EXACTLY as written. Keep numbers character-for-character.
- Preserve the document's own section structure (use ## headings, - bullets).
- Fix only PDF layout artifacts (broken line wraps, column interleaving, stray hyphenation).
- Do NOT add, infer, summarize, reorder, or omit ANYTHING. No commentary.
- Output ONLY the markdown.`;

export async function extractResumeMarkdown(pdfBase64: string): Promise<string> {
  const response = await getClient().messages.create({
    model: MODEL_CHEAP,
    max_tokens: 8000,
    system: EXTRACT_RULES,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: "Transcribe this resume into markdown." },
        ],
      },
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
