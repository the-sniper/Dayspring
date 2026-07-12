import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { getClient, MODEL_CHEAP, MODEL_PREMIUM, MODEL_SCORE } from "@/lib/claude/client";
import {
  hasOpenAIKey,
  OPENAI_CHEAP,
  OPENAI_PREMIUM,
  OPENAI_STANDARD,
  parseWithOpenAI,
  type ReasoningEffort,
} from "@/lib/ai/openai";

// One structured-completion entry point for the two provider-flexible tiers.
// It routes to OpenAI when an OpenAI key is present (the cost win the user
// asked for) and otherwise falls back to the equivalent Claude tier, so the
// app keeps working with only an Anthropic key. The perfection tier
// (Opus/Sonnet content generation, vision extraction, fabrication audit) does
// NOT go through here — it calls Claude directly in lib/claude.
//
//   "cheap"    — mechanical extraction/classification (Claude Haiku fallback)
//   "standard" — analytical scoring/ranking (Claude Sonnet fallback)
//   "premium"  — human-facing prose: cover letters, outreach, nudges
//                (Claude Opus + extended thinking fallback)
export type Tier = "cheap" | "standard" | "premium";

const OPENAI_MODEL: Record<Tier, string> = {
  cheap: OPENAI_CHEAP,
  standard: OPENAI_STANDARD,
  premium: OPENAI_PREMIUM,
};

const OPENAI_EFFORT: Record<Tier, ReasoningEffort> = {
  cheap: "low",
  standard: "medium",
  premium: "medium",
};

const CLAUDE_MODEL: Record<Tier, string> = {
  cheap: MODEL_CHEAP,
  standard: MODEL_SCORE,
  premium: MODEL_PREMIUM,
};

export async function structuredComplete<T>({
  tier,
  system,
  user,
  schema,
  schemaName,
  maxTokens,
  cache,
}: {
  tier: Tier;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens: number;
  // Large, stable block (e.g. the resume/profile). On OpenAI it becomes part
  // of the cacheable prefix; on Claude it gets an explicit cache_control mark.
  cache?: string;
}): Promise<{ data: T; usage: { input: number; output: number } }> {
  if (hasOpenAIKey()) {
    return parseWithOpenAI({
      model: OPENAI_MODEL[tier],
      // Stable content first keeps OpenAI's automatic prefix cache warm.
      system: cache ? `${system}\n\n${cache}` : system,
      user,
      schema,
      schemaName,
      maxOutputTokens: maxTokens,
      effort: OPENAI_EFFORT[tier],
    });
  }

  // Fallback: Claude, preserving the prompt-caching behaviour of the originals.
  const systemParam = cache
    ? [
        { type: "text" as const, text: system },
        {
          type: "text" as const,
          text: cache,
          cache_control: { type: "ephemeral" as const },
        },
      ]
    : system;

  const response = await getClient().messages.parse({
    model: CLAUDE_MODEL[tier],
    max_tokens: maxTokens,
    // Opus prose quality depends on extended thinking (it's off when omitted).
    ...(tier === "premium" ? { thinking: { type: "adaptive" as const } } : {}),
    system: systemParam,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (!response.parsed_output) {
    throw new Error(
      `Structured completion failed (stop_reason: ${response.stop_reason}).`,
    );
  }
  return {
    data: response.parsed_output as T,
    usage: {
      input:
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
      output: response.usage.output_tokens,
    },
  };
}
