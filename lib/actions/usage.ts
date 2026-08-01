"use server";

import {
  fetchProviderBalances,
  type ProviderUsageRow,
} from "@/lib/usage/balances";

export type ProviderBalancesResult =
  | { ok: true; rows: ProviderUsageRow[] }
  | { ok: false; error: string };

export async function fetchProviderBalancesAction(): Promise<ProviderBalancesResult> {
  try {
    const rows = await fetchProviderBalances();
    return { ok: true, rows };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load usage",
    };
  }
}
