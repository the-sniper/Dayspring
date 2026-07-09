import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_CHEAP } from "@/lib/claude/client";

// Turn a plain-English "find new people" query into Apollo people-search
// parameters. Never-fabricate: only extract locations/titles the query implies;
// leave a field empty rather than guess. Cheap tier — pure extraction a human
// reviews (results are shown before anything is saved).

const Params = z.object({
  person_titles: z.array(z.string()), // roles to match, sensibly expanded
  person_locations: z.array(z.string()), // cities/states/countries named
  keywords: z.string().nullable(), // extra intent (skills, focus) or null
  seniorities: z.array(z.string()), // apollo buckets, only if implied
  interpretation: z.string(), // one line: what this will search for
});

export type ApolloQueryParams = z.infer<typeof Params>;

const SENIORITIES =
  "owner, founder, c_suite, partner, vp, head, director, manager, senior, entry, intern";

const SYSTEM = `Convert a natural-language people-search into Apollo people-search parameters.

- person_titles: the job titles to match, expanded sensibly. "recruiters" → ["Recruiter","Technical Recruiter","Talent Acquisition"]. "eng managers" → ["Engineering Manager","Director of Engineering"]. Keep it tight (2–5 titles).
- person_locations: any city / state / country named ("in Philly" → ["Philadelphia"], "bay area" → ["San Francisco Bay Area"]). Empty array if no place is mentioned.
- keywords: extra free-text intent that isn't a title or place — skills, domain, or focus ("hiring for fullstack" → "fullstack", "fintech" → "fintech"). null if there's nothing extra.
- seniorities: only if clearly implied, from exactly this set: ${SENIORITIES}. Else empty.
- interpretation: one short sentence describing the search you'll run, e.g. "Technical recruiters in Philadelphia."

HARD RULES: Only extract what the query states or clearly implies. Never invent a location, company, or seniority that isn't there. If the query is too vague to search (no role, place, or keyword), return empty arrays and null keywords, and say so in interpretation.`;

export async function queryToApolloParams(
  query: string,
): Promise<ApolloQueryParams> {
  const response = await getClient().messages.parse({
    model: MODEL_CHEAP,
    max_tokens: 1000,
    system: SYSTEM,
    messages: [{ role: "user", content: query }],
    output_config: { format: zodOutputFormat(Params) },
  });

  if (!response.parsed_output) {
    throw new Error(`Couldn't parse that query (stop: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
