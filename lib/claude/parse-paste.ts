import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_CHEAP } from "@/lib/claude/client";
import { CandidateJobSchema, type CandidateJob } from "@/lib/types";

const PasteResult = z.object({
  jobs: z.array(CandidateJobSchema),
});

const MAX_CHARS = 20_000;

const SYSTEM = `You extract job postings from pasted text (job-board digests, emails, tracker exports from tools like JobRight, Simplify, or MigrateMate).

Rules:
- Only extract fields actually present in the text. Omit anything you cannot find.
- Never guess URLs, invent companies, or fabricate titles.
- status: only set if the text clearly states one — saved/bookmarked → "wishlist", applied → "applied", screening → "screen", interviewing → "interview", offer → "offer", rejected → "rejected". Otherwise omit.
- roleType: only set when the title makes it obvious — FDE (forward deployed / solutions engineer), FE (frontend), BE (backend), FS (fullstack), DATA (data/ML). Otherwise omit.
- date: ISO format YYYY-MM-DD, only if a date is present.
- Return an empty jobs array if the text contains no job postings.`;

export type PasteParse = {
  jobs: CandidateJob[];
  truncated: boolean;
  tokens: { input: number; output: number };
};

export async function parsePaste(rawText: string): Promise<PasteParse> {
  const truncated = rawText.length > MAX_CHARS;
  const text = truncated ? rawText.slice(0, MAX_CHARS) : rawText;

  const response = await getClient().messages.parse({
    model: MODEL_CHEAP,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(PasteResult) },
  });

  if (!response.parsed_output) {
    throw new Error(
      `Paste parsing failed (stop_reason: ${response.stop_reason}) — try a smaller paste.`,
    );
  }
  return {
    jobs: response.parsed_output.jobs,
    truncated,
    tokens: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}
