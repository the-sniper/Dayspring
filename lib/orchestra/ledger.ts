// The Ledger — budget enforcement as CODE, not an agent (final plan §3,
// Phase 1). Prices checked against the claude-api reference 2026-08-01;
// update alongside model ids in charters.ts.
import { api, convex } from "@/lib/convex/server";

type Price = { inp: number; out: number; cacheRead: number; cacheWrite: number };

// USD per 1M tokens. cacheRead = 10% of input; cacheWrite = 1.25x (5-min TTL).
const PRICES: Record<string, Price> = {
  "claude-opus-5": { inp: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { inp: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { inp: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  // Repo's existing premium tier, in case a role is pointed at it.
  "claude-opus-4-8": { inp: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

export function dailyCapUsd(): number {
  const raw = Number(process.env.ORCHESTRA_DAILY_CAP_USD ?? "5");
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

export class BudgetExceededError extends Error {
  constructor(spent: number, cap: number) {
    super(
      `Orchestra daily budget reached: $${spent.toFixed(2)} of $${cap.toFixed(2)} cap. ` +
        `No further model calls today (raise ORCHESTRA_DAILY_CAP_USD to override).`,
    );
    this.name = "BudgetExceededError";
  }
}

// Hard stop, checked BEFORE every model call. Also returns current spend so
// callers can log it.
export async function guardBudget(runDate: string): Promise<number> {
  const { costUsd } = await convex().query(api.orchestra.spendForDate, {
    runDate,
  });
  const cap = dailyCapUsd();
  if (costUsd >= cap) throw new BudgetExceededError(costUsd, cap);
  return costUsd;
}

export type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function costOf(model: string, usage: Usage): number {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5"];
  const inp = usage.input_tokens ?? 0;
  const out = usage.output_tokens ?? 0;
  const cRead = usage.cache_read_input_tokens ?? 0;
  const cWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (inp * p.inp + out * p.out + cRead * p.cacheRead + cWrite * p.cacheWrite) /
    1_000_000
  );
}

// Record a call in the ledger and return its cost. Every messages.create in
// lib/orchestra MUST be followed by this — an unledgered call is a bug.
export async function recordSpend(args: {
  runDate: string;
  role: string;
  taskId?: string;
  model: string;
  usage: Usage;
}): Promise<number> {
  const costUsd = costOf(args.model, args.usage);
  await convex().mutation(api.orchestra.insertLedger, {
    runDate: args.runDate,
    role: args.role,
    ...(args.taskId ? { taskId: args.taskId as never } : {}),
    model: args.model,
    tokensIn: args.usage.input_tokens ?? 0,
    tokensOut: args.usage.output_tokens ?? 0,
    cacheReadTokens: args.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: args.usage.cache_creation_input_tokens ?? 0,
    costUsd,
  });
  return costUsd;
}
