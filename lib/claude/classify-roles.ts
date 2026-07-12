import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";
import { ROLE_TYPES, type RoleType } from "@/lib/types";

const Classification = z.object({
  classifications: z.array(
    z.object({
      index: z.number(),
      role_type: z.enum([...ROLE_TYPES, "OTHER"]),
    }),
  ),
});

export const CLASSIFY_BATCH_LIMIT = 40;

// One cheap call for a batch of titles the regex heuristics missed.
// OTHER (sales, marketing, ops…) maps to null and stays displayed as "—".
export async function classifyRoles(
  titles: string[],
): Promise<(RoleType | null)[]> {
  const batch = titles.slice(0, CLASSIFY_BATCH_LIMIT);
  const { data } = await structuredComplete({
    tier: "cheap",
    schema: Classification,
    schemaName: "role_classification",
    maxTokens: 2000,
    system: `Classify job titles into exactly one category:
FDE (forward deployed / solutions / field / customer engineer), FE (frontend), BE (backend / platform / infra), FS (fullstack / product engineer / generalist software engineer), DATA (data / ML / analytics), or OTHER (anything non-engineering: sales, marketing, ops, design, legal, etc.).
Return one classification per input index. When genuinely ambiguous between engineering types, prefer FS for generic software titles; use OTHER for everything non-engineering.`,
    user: batch.map((t, i) => `${i}: ${t}`).join("\n"),
  });

  const result: (RoleType | null)[] = batch.map(() => null);
  for (const c of data.classifications) {
    if (c.index >= 0 && c.index < batch.length && c.role_type !== "OTHER") {
      result[c.index] = c.role_type as RoleType;
    }
  }
  return result;
}
