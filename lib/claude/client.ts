import Anthropic from "@anthropic-ai/sdk";

// Model picks (checked against the claude-api reference 2026-07-05):
// scoring gets Sonnet — fit judgment drives which jobs get pursued; parsing
// and title classification are mechanical extraction a human reviews, so the
// cheap tier is plenty. Opus 4.8 is reserved for the future tailoring pass.
export const MODEL_SCORE = "claude-sonnet-5";
export const MODEL_CHEAP = "claude-haiku-4-5";

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    // Reads ANTHROPIC_API_KEY from the environment. Server-side only —
    // nothing in lib/claude may be imported by a client component.
    client = new Anthropic();
  }
  return client;
}
