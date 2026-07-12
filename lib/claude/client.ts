import Anthropic from "@anthropic-ai/sdk";
import { getKey } from "@/lib/keys";

// Model picks (checked against the claude-api reference 2026-07-05).
//
// Provider split: when an OpenAI key is present, the analytical/mechanical tiers
// (scoring, ranking, classification, extraction) route to GPT-5.6 via lib/ai to
// cut cost — see lib/ai/complete.ts. These Claude tiers are the FALLBACK for
// those tasks (used when no OpenAI key), and remain the primary path for the
// fabrication audit (MODEL_SCORE = Sonnet), which stays on Claude for safety.
export const MODEL_SCORE = "claude-sonnet-5";
export const MODEL_CHEAP = "claude-haiku-4-5";
// The perfection tier — tailored resume documents, PDF fidelity extraction, and
// consolidation: the source of truth, always Claude Opus. Also the FALLBACK
// (with extended thinking) for the "premium" prose tier in lib/ai (cover
// letters, outreach, nudges) when no OpenAI key is set.
export const MODEL_PREMIUM = "claude-opus-4-8";

export async function hasApiKey(): Promise<boolean> {
  return !!(await getKey("ANTHROPIC_API_KEY"));
}

// Env first, then the encrypted key saved in Settings → API Keys. The client
// is rebuilt if the key changes (e.g. saved/rotated in Settings mid-session).
// Server-side only — nothing in lib/claude may be imported by a client
// component.
let client: Anthropic | null = null;
let clientKey: string | null = null;

export async function getClient(): Promise<Anthropic> {
  const key = await getKey("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (env or Settings → API Keys).");
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key });
    clientKey = key;
  }
  return client;
}
