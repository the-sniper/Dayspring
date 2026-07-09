import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_SCORE } from "@/lib/claude/client";

// Semantic "ask" search over the user's own contacts. The data is thin
// (LinkedIn CSV = name / title / company only), so the model ranks by role +
// company relevance and is REQUIRED to flag any criterion it couldn't apply
// (location, skills, hiring-focus) rather than fabricate it.

const AskResult = z.object({
  matches: z.array(
    z.object({
      id: z.number(),
      reason: z.string(), // one line, grounded in title/company
    }),
  ),
  caveat: z.string().nullable(), // what couldn't be filtered from the data
});

export type ContactForAsk = {
  id: number;
  name: string;
  title: string | null;
  detail: string | null; // notes/company blob
};

const RULES = `You help someone search their OWN professional contacts with a natural-language query.

Each contact has only: name, their job TITLE, and a DETAIL string that usually contains their company (e.g. "Sr. Technical Recruiter @ Ampstek · Connected 2024"). You do NOT have their location, skills, or who they are hiring for — only what the title/company imply.

Your job: return the contacts that best match the query's INTENT, most relevant first. For each, give a SHORT reason grounded ONLY in their title/company.

HARD RULES:
- Never invent a location, skill, seniority, or hiring focus that isn't in the title/company. If the query asks for something you can't see (a city, a specific tech stack, "hiring for X"), match on what you CAN see (role, company) and set "caveat" to explain exactly what you couldn't filter — e.g. "Your contacts don't include location, so I matched recruiters by role/company only — confirm they're in Philadelphia on their profiles."
- Rank by genuine relevance. A "Technical Recruiter" strongly matches "recruiters"; a "Software Engineer" does not.
- Return the 15–20 MOST relevant matches — not an exhaustive list. If nothing fits, return an empty list with a caveat saying so.
- reason must be SHORT (≤ 12 words) and specific ("Technical recruiter at a staffing firm"), never generic ("good match"). No newlines inside a reason.`;

export async function askContacts(
  query: string,
  contacts: ContactForAsk[],
): Promise<{ matches: { id: number; reason: string }[]; caveat: string | null }> {
  // Cap the prompt for very large address books (most recent first).
  const capped = contacts.slice(0, 2000);
  const list = capped
    .map((c) => `${c.id}|${c.name}|${c.title ?? ""}|${c.detail ?? ""}`)
    .join("\n");

  const response = await getClient().messages.parse({
    model: MODEL_SCORE,
    max_tokens: 8000,
    system: RULES,
    messages: [
      {
        role: "user",
        content: `QUERY: ${query}\n\nCONTACTS (id|name|title|detail):\n${list}`,
      },
    ],
    output_config: { format: zodOutputFormat(AskResult) },
  });

  if (!response.parsed_output) {
    throw new Error(`Contact search failed (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
