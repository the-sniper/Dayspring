import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";

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
  const { data } = await structuredComplete({
    tier: "cheap",
    schema: Params,
    schemaName: "apollo_query_params",
    maxTokens: 1000,
    system: SYSTEM,
    user: query,
  });
  return data;
}
