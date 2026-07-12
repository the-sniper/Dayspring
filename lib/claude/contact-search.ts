import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";

// Semantic "ask" search over the user's own contacts. The data is thin
// (LinkedIn CSV = name / title / company only), so the model ranks by role +
// company relevance and is REQUIRED to flag any criterion it couldn't apply
// (location, skills, hiring-focus) rather than fabricate it.

const AskResult = z.object({
  matches: z.array(
    z.object({
      id: z.number(), // row index into the prompt list (see askContacts)
      reason: z.string(), // one line, grounded in title/company
    }),
  ),
  caveat: z.string().nullable(), // what couldn't be filtered from the data
});

export type ContactForAsk = {
  id: string;
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
): Promise<{ matches: { id: string; reason: string }[]; caveat: string | null }> {
  // Cap the prompt for very large address books (most recent first). Contacts
  // are addressed by row INDEX in the prompt (Convex ids are long opaque
  // strings — cheaper and less error-prone for the model to echo an index).
  const capped = contacts.slice(0, 2000);
  const list = capped
    .map((c, i) => `${i}|${c.name}|${c.title ?? ""}|${c.detail ?? ""}`)
    .join("\n");

  const { data } = await structuredComplete({
    tier: "standard",
    schema: AskResult,
    schemaName: "contact_matches",
    maxTokens: 8000,
    system: RULES,
    user: `QUERY: ${query}\n\nCONTACTS (id|name|title|detail):\n${list}`,
  });
  const matches = data.matches
    .map((m) => {
      const row = capped[m.id];
      return row ? { id: row.id, reason: m.reason } : null;
    })
    .filter((m): m is { id: string; reason: string } => m !== null);
  return { matches, caveat: data.caveat };
}
