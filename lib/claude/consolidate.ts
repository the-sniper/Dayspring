import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_PREMIUM } from "@/lib/claude/client";

// Consolidate ALL master resumes into ONE canonical profile document —
// the union of the candidate's truthful material (Tsenta-style profile).
// Never-fabricate: merge, dedupe, and organize; invent nothing.

export const ConsolidatedDocSchema = z.object({
  name: z.string(),
  headline: z.string().nullable(), // e.g. "Full-Stack / AI Engineer" — from master facts
  summary: z.string().nullable(), // 2–3 lines, drawn only from master facts
  contact: z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
    website: z.string().nullable(),
  }),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()) })),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string().nullable(),
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
      degree: z.string().nullable(), // "Masters", "BS" — the credential alone
      field: z.string().nullable(), // major/concentration, e.g. "Computer Science"
      minor: z.string().nullable(),
      gpa: z.string().nullable(), // "3.7" — exactly as printed
      startDate: z.string().nullable(), // "Sep 2024"
      endDate: z.string().nullable(), // "June 2026 (expected)"
      location: z.string().nullable(),
      detail: z.string().nullable(), // anything true that fits nowhere above
    }),
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      organization: z.string().nullable(),
      issueDate: z.string().nullable(),
      expirationDate: z.string().nullable(),
      credentialId: z.string().nullable(),
      credentialUrl: z.string().nullable(),
    }),
  ),
  // What was merged/deduped/conflicted — shown to the human, never hidden.
  merge_notes: z.array(z.string()),
});

export type ConsolidatedDoc = z.infer<typeof ConsolidatedDocSchema>;

const RULES = `You consolidate one candidate's resume variants into a single canonical profile document. This is a UNION, not a tailoring: keep ALL truthful material across every version.

HARD RULES — never fabricate:
- Every employer, title, date, degree, bullet, skill, metric, and link must appear in at least one source resume, verbatim in substance. Numbers character-for-character.
- Same role in multiple versions → ONE entry: union the bullets, dropping only near-duplicates (keep the more specific/quantified phrasing). Conflicting dates or titles for the same role → prefer the most complete/recent version and record the conflict in merge_notes.
- Include EVERY distinct role, project, education entry, and certification found anywhere.
- skills: the union, grouped sensibly; every skill must appear in some source.
- education: split into fields — degree is the credential alone ("Masters"), field is the major/concentration ("Computer Science"), gpa exactly as printed, start/end dates separately (mark expected graduations "(expected)"). null for anything the sources don't state; unclassifiable-but-true remainders go in detail.
- certifications: structured (name/organization/dates/credential) — null for anything not printed.
- summary/headline: only from source facts; no adjectives the sources don't support.
- contact: exactly as printed in the sources; conflicts → most recent, noted in merge_notes.
- merge_notes: one line per merge decision worth knowing ("Merged 'Acme SWE II' bullets from 2 versions, dropped 1 duplicate", "Phone differs between versions; kept …"). Empty if nothing notable.`;

export async function consolidateResumes(
  masters: { label: string; content: string }[],
): Promise<{ doc: ConsolidatedDoc; tokens: { input: number; output: number } }> {
  const corpus = masters
    .map((m) => `=== RESUME VERSION: ${m.label} ===\n${m.content}`)
    .join("\n\n");

  const response = await (await getClient()).messages.parse({
    model: MODEL_PREMIUM,
    max_tokens: 20_000,
    thinking: { type: "adaptive" },
    system: RULES,
    messages: [
      {
        role: "user",
        content: `Consolidate these ${masters.length} resume version(s) into the canonical profile document:\n\n${corpus.slice(0, 80_000)}`,
      },
    ],
    output_config: { format: zodOutputFormat(ConsolidatedDocSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`Consolidation failed (stop: ${response.stop_reason})`);
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
