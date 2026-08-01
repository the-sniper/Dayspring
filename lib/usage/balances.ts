import { getKey } from "@/lib/keys";
import { getApolloUsage } from "@/lib/integrations/apollo/usage";
import { getApifyUsage } from "@/lib/integrations/apify/usage";
import { getUsage as getHappenstanceUsage } from "@/lib/integrations/happenstance/client";

export type ProviderUsageRow = {
  id: "apollo" | "happenstance" | "apify" | "anthropic" | "openai";
  label: string;
  connected: boolean;
  /** Short headline, e.g. "9,500 left". Null when we can't fetch. */
  primary: string | null;
  /** Secondary line, e.g. "500 used of 10,000". */
  detail: string | null;
  /** Console / billing URL for the provider. */
  href: string;
  /** Why primary is empty when connected. */
  note: string | null;
};

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 10 ? 2 : 0,
  });
}

async function apolloRow(): Promise<ProviderUsageRow> {
  const connected = !!(await getKey("APOLLO_API_KEY"));
  const base = {
    id: "apollo" as const,
    label: "Apollo",
    connected,
    href: "https://app.apollo.io/#/settings/credits/about",
    primary: null,
    detail: null,
    note: connected ? "Couldn’t load credits" : null,
  };
  if (!connected) return { ...base, note: null };

  const u = await getApolloUsage();
  if (u.creditsRemaining === null && u.leadCredits === null) return base;

  const remaining = u.creditsRemaining;
  const allowance = u.leadCredits;
  const used = u.leadCreditsUsed;
  return {
    ...base,
    primary:
      remaining !== null
        ? `${fmtInt(remaining)} credits left`
        : allowance !== null && used !== null
          ? `${fmtInt(Math.max(0, allowance - used))} credits left`
          : null,
    detail:
      allowance !== null && used !== null
        ? `${fmtInt(used)} used of ${fmtInt(allowance)}`
        : null,
    note: null,
  };
}

async function happenstanceRow(): Promise<ProviderUsageRow> {
  const connected = !!(await getKey("HAPPENSTANCE_API_KEY"));
  const base = {
    id: "happenstance" as const,
    label: "Happenstance",
    connected,
    href: "https://happenstance.ai",
    primary: null,
    detail: null,
    note: connected ? "Couldn’t load credits" : null,
  };
  if (!connected) return { ...base, note: null };

  const { balance } = await getHappenstanceUsage();
  if (balance === null) return base;
  return {
    ...base,
    primary: `${fmtInt(balance)} credits left`,
    detail: "2 per search · 1 per research",
    note: null,
  };
}

async function apifyRow(): Promise<ProviderUsageRow> {
  const connected = !!(await getKey("APIFY_API_TOKEN"));
  const base = {
    id: "apify" as const,
    label: "Apify",
    connected,
    href: "https://console.apify.com/billing#/limits",
    primary: null,
    detail: null,
    note: connected ? "Couldn’t load usage" : null,
  };
  if (!connected) return { ...base, note: null };

  const u = await getApifyUsage();
  if (u.usedUsd === null && u.limitUsd === null) return base;

  const remaining =
    u.usedUsd !== null && u.limitUsd !== null
      ? Math.max(0, u.limitUsd - u.usedUsd)
      : null;
  return {
    ...base,
    primary:
      remaining !== null
        ? `${fmtUsd(remaining)} left this month`
        : u.usedUsd !== null
          ? `${fmtUsd(u.usedUsd)} used this month`
          : null,
    detail:
      u.usedUsd !== null && u.limitUsd !== null
        ? `${fmtUsd(u.usedUsd)} of ${fmtUsd(u.limitUsd)}`
        : null,
    note: null,
  };
}

async function consoleOnlyRow(
  id: "anthropic" | "openai",
  label: string,
  keyName: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY",
  href: string,
): Promise<ProviderUsageRow> {
  const connected = !!(await getKey(keyName));
  return {
    id,
    label,
    connected,
    href,
    primary: null,
    detail: null,
    note: connected
      ? "Balance isn’t exposed on normal API keys — check the console"
      : null,
  };
}

/** Parallel fetch of every connected provider’s usage we can read. */
export async function fetchProviderBalances(): Promise<ProviderUsageRow[]> {
  const rows = await Promise.all([
    apolloRow(),
    happenstanceRow(),
    apifyRow(),
    consoleOnlyRow(
      "anthropic",
      "Anthropic",
      "ANTHROPIC_API_KEY",
      "https://console.anthropic.com/settings/billing",
    ),
    consoleOnlyRow(
      "openai",
      "OpenAI",
      "OPENAI_API_KEY",
      "https://platform.openai.com/usage",
    ),
  ]);
  return rows.filter((r) => r.connected);
}
