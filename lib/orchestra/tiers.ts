// Model tiers — the cost/quality dial (docs/agent-orchestra-costs-and-evals.md
// §2/§6). One setting flips every agent's model by ROLE CLASS (lead/worker/
// grunt), never per-prompt, so behavior stays predictable.
//
// Why switching tiers never loses context or breaks caching:
//   - All durable context (tasks, artifacts, reports, memory) lives in Convex
//     and is model-independent — a tier switch touches none of it.
//   - Charters/preamble (the cached prefix) are IDENTICAL across tiers, so a
//     switch just re-warms the prompt cache once on the new model (~a cent);
//     within a run the tier is resolved ONCE, so a mid-day switch can never
//     split one run across models or thrash the cache.
//
// No local models by design: tool-calling reliability is the dimension where
// local lags most, and this system is tool loops with typed contracts.
import { getSetting, setSetting } from "@/lib/settings/store";

export type TierId = "quality" | "balanced" | "budget";
export type ModelRole = "lead" | "worker" | "grunt";

export const TIER_SETTING_KEY = "orchestraModelTier";
export const DEFAULT_TIER: TierId = "quality";

export type Tier = {
  id: TierId;
  label: string;
  tagline: string;
  models: Record<ModelRole, string>;
  estDaily: string;
  tradeoff: string;
};

export const TIERS: Record<TierId, Tier> = {
  quality: {
    id: "quality",
    label: "Quality",
    tagline: "Opus where errors compound, Sonnet everywhere else",
    models: {
      lead: "claude-opus-5",
      worker: "claude-sonnet-5",
      grunt: "claude-haiku-4-5",
    },
    estDaily: "≈ $2.00–2.50/day full org (~$63–75/mo)",
    tradeoff:
      "The research default: model choice beats token budget exactly where errors compound — plans, verification, strategy, specs. A bad plan or a rubber-stamp poisons everything downstream.",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    tagline: "Sonnet across the board, Haiku for grunt work",
    models: {
      lead: "claude-sonnet-5",
      worker: "claude-sonnet-5",
      grunt: "claude-haiku-4-5",
    },
    estDaily: "≈ $1.00–1.30/day full org (~$32–40/mo)",
    tradeoff:
      "Demotes every lead (orchestration, verification, strategy, specs, review) to Sonnet. Fine when work is routine; watch first-pass yield and verifier strictness — calibrate before trusting a week of this.",
  },
  budget: {
    id: "budget",
    label: "Budget",
    tagline: "Sonnet leads, Haiku does the work",
    models: {
      lead: "claude-sonnet-5",
      worker: "claude-haiku-4-5",
      grunt: "claude-haiku-4-5",
    },
    estDaily: "≈ $0.45–0.65/day full org (~$14–20/mo)",
    tradeoff:
      "Cheapest sane config. Expect more needs_work retries (retries cost tokens too — below a point this tier is false economy). Calibration pass required before leaving it on.",
  },
};

export function isTierId(x: string): x is TierId {
  return x === "quality" || x === "balanced" || x === "budget";
}

// Read ONCE per run (or page render) — never per call — so a mid-run switch
// cannot split a run across models.
export async function resolveTier(): Promise<Tier> {
  const raw = await getSetting(TIER_SETTING_KEY);
  return raw && isTierId(raw) ? TIERS[raw] : TIERS[DEFAULT_TIER];
}

export async function setTier(tier: TierId): Promise<void> {
  await setSetting(TIER_SETTING_KEY, tier);
}
