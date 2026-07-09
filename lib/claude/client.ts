import Anthropic from "@anthropic-ai/sdk";
import { getKey } from "@/lib/keys";

// Model picks (checked against the claude-api reference 2026-07-05):
// scoring gets Sonnet — fit judgment drives which jobs get pursued; parsing
// and title classification are mechanical extraction a human reviews, so the
// cheap tier is plenty. Opus 4.8 is reserved for the future tailoring pass.
export const MODEL_SCORE = "claude-sonnet-5";
export const MODEL_CHEAP = "claude-haiku-4-5";
// Tailored bullets, cover letters, outreach drafts — the words that reach
// humans. Low volume, always user-triggered, worth the premium tier.
export const MODEL_PREMIUM = "claude-opus-4-8";

export function hasApiKey(): boolean {
  return !!getKey("ANTHROPIC_API_KEY");
}

// Env first, then the encrypted key saved in Settings → API Keys. The client
// is rebuilt if the key changes (e.g. saved/rotated in Settings mid-session).
// Server-side only — nothing in lib/claude may be imported by a client
// component.
let client: Anthropic | null = null;
let clientKey: string | null = null;

export function getClient(): Anthropic {
  const key = getKey("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (env or Settings → API Keys).");
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key });
    clientKey = key;
  }
  return client;
}
