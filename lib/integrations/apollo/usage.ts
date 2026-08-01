import { getKey } from "@/lib/keys";
import { hasApolloKey } from "@/lib/integrations/apollo/client";

export type ApolloUsage = {
  creditsRemaining: number | null;
  leadCredits: number | null;
  leadCreditsUsed: number | null;
};

// GET /users/api_profile?include_credit_usage=true — free, returns remaining
// lead credits (the ones enrich / org search spend). apolloFetch is POST-only
// for search/enrich, so this path is separate.
export async function getApolloUsage(): Promise<ApolloUsage> {
  const empty: ApolloUsage = {
    creditsRemaining: null,
    leadCredits: null,
    leadCreditsUsed: null,
  };
  if (!(await hasApolloKey())) return empty;

  const key = await getKey("APOLLO_API_KEY");
  if (!key) return empty;

  const attempt = (auth: Record<string, string>) =>
    fetch(
      "https://api.apollo.io/api/v1/users/api_profile?include_credit_usage=true",
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "cache-control": "no-cache",
          ...auth,
        },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      },
    );

  try {
    let res = await attempt({ "x-api-key": key });
    if (res.status === 401 || res.status === 403) {
      res = await attempt({ authorization: `Bearer ${key}` });
    }
    if (!res.ok) return empty;

    const data = (await res.json()) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    return {
      creditsRemaining: num(data.num_credits_remaining),
      leadCredits: num(data.effective_num_lead_credits),
      leadCreditsUsed: num(data.num_lead_credits_used),
    };
  } catch {
    return empty;
  }
}
