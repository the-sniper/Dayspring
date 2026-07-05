import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_CHEAP } from "@/lib/claude/client";
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
  const response = await getClient().messages.parse({
    model: MODEL_CHEAP,
    max_tokens: 2000,
    system: `Classify job titles into exactly one category:
FDE (forward deployed / solutions / field / customer engineer), FE (frontend), BE (backend / platform / infra), FS (fullstack / product engineer / generalist software engineer), DATA (data / ML / analytics), or OTHER (anything non-engineering: sales, marketing, ops, design, legal, etc.).
Return one classification per input index. When genuinely ambiguous between engineering types, prefer FS for generic software titles; use OTHER for everything non-engineering.`,
    messages: [
      {
        role: "user",
        content: batch.map((t, i) => `${i}: ${t}`).join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(Classification) },
  });

  if (!response.parsed_output) {
    throw new Error(`Classification failed (stop_reason: ${response.stop_reason})`);
  }
  const result: (RoleType | null)[] = batch.map(() => null);
  for (const c of response.parsed_output.classifications) {
    if (c.index >= 0 && c.index < batch.length && c.role_type !== "OTHER") {
      result[c.index] = c.role_type as RoleType;
    }
  }
  return result;
}
