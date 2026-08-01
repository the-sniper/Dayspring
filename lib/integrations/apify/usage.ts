import { getKey } from "@/lib/keys";

export type ApifyUsage = {
  usedUsd: number | null;
  limitUsd: number | null;
};

export async function hasApifyKey(): Promise<boolean> {
  return !!(await getKey("APIFY_API_TOKEN"));
}

// GET /v2/users/me/limits — monthly $ usage vs soft limit (same numbers as
// console.apify.com/billing#/limits).
export async function getApifyUsage(): Promise<ApifyUsage> {
  const empty: ApifyUsage = { usedUsd: null, limitUsd: null };
  const token = await getKey("APIFY_API_TOKEN");
  if (!token) return empty;

  try {
    const res = await fetch("https://api.apify.com/v2/users/me/limits", {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) return empty;

    const json = (await res.json()) as {
      data?: {
        current?: { monthlyUsageUsd?: number };
        limits?: { maxMonthlyUsageUsd?: number };
      };
    };
    const used = json.data?.current?.monthlyUsageUsd;
    const limit = json.data?.limits?.maxMonthlyUsageUsd;
    return {
      usedUsd: typeof used === "number" ? used : null,
      limitUsd: typeof limit === "number" ? limit : null,
    };
  } catch {
    return empty;
  }
}
