import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { getKey } from "@/lib/keys";

// OpenAI is the COST tier: analytical + mechanical work (scoring, ranking,
// classification, extraction) where a strong general model matches Claude's
// output but costs less. The perfection tier (tailored resumes, cover letters,
// outreach, PDF fidelity extraction, fabrication audit) stays on Claude Opus /
// Sonnet in lib/claude. Nothing here touches words that reach a human verbatim.
//
// GPT-5.6 family (verified against OpenAI model guidance, 2026):
//   terra — balanced intelligence/cost; our default for scoring + ranking
//   luna  — efficient, high-volume; our default for cheap extraction/classification
// Both are reasoning models, so we use the Responses API (recommended path) and
// steer cost/latency with reasoning.effort. Overridable via env for quick A/B.
export const OPENAI_STANDARD = process.env.OPENAI_MODEL_STANDARD || "gpt-5.6-terra";
export const OPENAI_CHEAP = process.env.OPENAI_MODEL_CHEAP || "gpt-5.6-luna";
// Human-facing prose the candidate sends out (cover letters, outreach, nudges).
// Strong-but-cost-aware default; bump to "gpt-5.6-sol" for flagship quality.
export const OPENAI_PREMIUM = process.env.OPENAI_MODEL_PREMIUM || "gpt-5.6-terra";

export function hasOpenAIKey(): boolean {
  return !!getKey("OPENAI_API_KEY");
}

// Env first, then the encrypted Settings key. Rebuilt if the key rotates
// mid-session. Server-side only — never import from a client component.
let client: OpenAI | null = null;
let clientKey: string | null = null;

export function getOpenAIClient(): OpenAI {
  const key = getKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set (env or Settings → API Keys).");
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey: key });
    clientKey = key;
  }
  return client;
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

// Reasoning models count hidden reasoning tokens against max_output_tokens, so a
// budget sized for Claude (no reasoning) would truncate the JSON. Give the model
// room to think on top of the caller's output budget.
function reasoningHeadroom(effort: ReasoningEffort): number {
  switch (effort) {
    case "none":
      return 0;
    case "low":
      return 3000;
    case "high":
    case "xhigh":
      return 12_000;
    default:
      return 6000;
  }
}

// Structured-output completion via the Responses API. Returns the parsed object
// (schema-validated by the SDK) plus token usage in the same shape lib/claude
// reports, so call sites stay symmetric across providers.
export async function parseWithOpenAI<T>({
  model,
  system,
  user,
  schema,
  schemaName,
  maxOutputTokens,
  effort = "medium",
}: {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxOutputTokens: number;
  effort?: ReasoningEffort;
}): Promise<{ data: T; usage: { input: number; output: number } }> {
  const response = await getOpenAIClient().responses.parse({
    model,
    reasoning: { effort },
    max_output_tokens: maxOutputTokens + reasoningHeadroom(effort),
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: { format: zodTextFormat(schema, schemaName) },
  });

  const data = response.output_parsed as T | null;
  if (data == null) {
    const refusal = response.output
      ?.flatMap((item) =>
        item.type === "message" ? item.content : [],
      )
      .find((c) => c.type === "refusal");
    throw new Error(
      refusal && "refusal" in refusal
        ? `OpenAI refused the request: ${refusal.refusal}`
        : `OpenAI returned no structured output (status: ${response.status ?? "unknown"}).`,
    );
  }
  return {
    data,
    usage: {
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
    },
  };
}
