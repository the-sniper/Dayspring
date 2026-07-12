// Fabrication audit — the safety net between AI generation and a real
// application. Every generated claim is classified against the SOURCE resume:
//   supported   — verbatim or faithful rephrase (source quote included)
//   adjusted    — honest rephrase / JD-vocabulary mirror (green highlight)
//   unsupported — no basis in the source = fabrication risk (red highlight)
// Runs after generate, align, and every Edit-with-AI pass.
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_SCORE } from "@/lib/claude/client";
import type { ResumeDocType } from "@/lib/claude/resume";
import type { ResumeAudit } from "@/lib/resumes/audit-types";

const AuditOut = z.object({
  findings: z.array(
    z.object({
      path: z.string(),
      text: z.string(),
      status: z.enum(["supported", "adjusted", "unsupported"]),
      source_quote: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
  summary: z.string(),
});

const AUDIT_RULES = `You audit an AI-tailored resume for fabrication. The SOURCE RESUME is ground truth; the GENERATED RESUME (JSON) was produced by another model that was told to select/reorder/rephrase but NEVER invent.

For EVERY auditable item in the generated resume, output one finding. Auditable items and their exact "path" values:
- "headline" — the headline string
- "summary" — the summary (audit it as ONE item)
- "experience.<i>.dates" — each experience date range
- "experience.<i>.bullets.<j>" — each experience bullet
- "projects.<i>.bullets.<j>" — each project bullet (and "projects.<i>.blurb" for blurbs)
- "skills.<gi>.items.<ii>" — each individual skill
- "education.<i>.detail" — each education detail line (if present)
Indices are zero-based and MUST match the JSON positions exactly. "text" MUST be the item's text copied verbatim from the JSON.

Classify each item:
- "supported": stated in the source verbatim or with meaning fully preserved. source_quote = the shortest source excerpt that proves it.
- "adjusted": honest rephrase, reordering, tightening, or JD-vocabulary mirroring (source "React" → "React.js"), or a date whose FORMAT was normalized but values kept. Meaning intact, emphasis changed. source_quote = the source excerpt it derives from. note = one short line on what changed.
- "unsupported": ANY part has no basis in the source — an invented metric, tool, scope, title, date, or achievement. Exaggeration counts ("led team" from a source that says "worked with team"). source_quote = the closest source text, or null if nothing relates. note = one short line naming exactly what is unsupported.

Special cases:
- headline: it is EXPECTED to be the target job title (positioning, not an employment claim). Mark it "adjusted" when it differs from the source's own title/headline — "unsupported" ONLY if it claims a credential the candidate lacks (e.g. "PhD", "CPA").
- A skill is "supported" if it appears anywhere in the source (any spelling variant); "unsupported" if absent.
- Numbers are strict: a changed or invented number is "unsupported" even if plausible.

summary: 2–3 sentences for the reviewer — how many items were adjusted vs unsupported and what to double-check first. Written to the candidate ("your resume…").

Be exhaustive and strict — a missed fabrication reaches an employer with the candidate's name on it.`;

export async function auditResumeDoc(
  sourceText: string,
  doc: ResumeDocType,
): Promise<ResumeAudit> {
  const response = await getClient().messages.parse({
    model: MODEL_SCORE,
    max_tokens: 16_000,
    system: [
      { type: "text", text: AUDIT_RULES },
      {
        type: "text",
        text: `SOURCE RESUME (ground truth):\n\n${sourceText.slice(0, 60_000)}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `GENERATED RESUME (JSON):\n\n${JSON.stringify(
          {
            headline: doc.headline,
            summary: doc.summary,
            skills: doc.skills,
            experience: doc.experience,
            projects: doc.projects,
            education: doc.education,
          },
          null,
          2,
        )}`,
      },
    ],
    output_config: { format: zodOutputFormat(AuditOut) },
  });

  if (!response.parsed_output) {
    throw new Error(`Resume audit failed (stop_reason: ${response.stop_reason})`);
  }
  const out = response.parsed_output;
  return {
    findings: out.findings.map((f) => ({
      path: f.path,
      text: f.text,
      status: f.status,
      sourceQuote: f.source_quote,
      note: f.note,
    })),
    summary: out.summary,
  };
}
