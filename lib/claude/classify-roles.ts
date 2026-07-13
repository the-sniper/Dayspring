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
FDE (forward deployed / solutions / field / customer engineer), FE (frontend / web), BE (backend / API / distributed systems), FS (fullstack / product engineer / generalist software engineer), MOBILE (iOS / Android / cross-platform apps), DATA (data engineering / analytics / BI), AIML (machine learning / AI / research), INFRA (DevOps / SRE / platform / cloud infrastructure), SEC (security / appsec / infosec), QA (QA / test / SDET), EMB (embedded / firmware / hardware / robotics), XR (AR / VR / spatial computing), GAME (game development), PM (product / technical program management), DESIGN (product / UX / visual design), or OTHER (anything else: sales, marketing, ops, finance, legal, recruiting, etc.).
Return one classification per input index. When genuinely ambiguous between engineering types, prefer FS for generic software titles; use OTHER for anything that fits no category.`,
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
