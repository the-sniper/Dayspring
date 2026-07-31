import { apolloFetch } from "./client";
import { getKey } from "@/lib/keys";
import { keyNotSet } from "@/lib/keys/messages";

type MatchResponse = {
  person?: {
    email?: string | null;
    email_status?: string | null;
  } | null;
};

// CONSUMES AN APOLLO CREDIT per enriched record — only called from the
// explicit "Reveal email" button, never automatically. Work emails only.
export async function enrichPerson({
  apolloId,
}: {
  apolloId: string;
}): Promise<{ email: string | null; emailStatus: string | null }> {
  const data = await apolloFetch<MatchResponse>("people/match", {
    id: apolloId,
    reveal_personal_emails: false,
  });
  const email = data.person?.email ?? null;
  return {
    // Apollo returns a placeholder like email_not_unlocked@… when it can't
    // reveal — treat that as no email.
    email: email && !email.includes("email_not_unlocked") ? email : null,
    emailStatus: data.person?.email_status ?? null,
  };
}

type OrgResponse = {
  organization?: {
    name?: string | null;
    estimated_num_employees?: number | null;
    founded_year?: number | null;
  } | null;
};

// Organization enrichment is GET-with-query-params, unlike the POST endpoints
// apolloFetch wraps, so it builds its own request. Costs 1 credit per company
// and is only ever called from the explicit Settings backfill — never on a
// page render.
export async function enrichOrganization(
  domain: string,
): Promise<{ headcount: number | null; foundedYear: number | null }> {
  const key = await getKey("APOLLO_API_KEY");
  if (!key) throw new Error(keyNotSet("APOLLO_API_KEY"));

  const res = await fetch(
    `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`,
    {
      headers: { accept: "application/json", "x-api-key": key },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `apollo/organizations/enrich: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  }
  const data = (await res.json()) as OrgResponse;
  const headcount = data.organization?.estimated_num_employees ?? null;
  return {
    // Apollo returns 0 for organizations it has no headcount for; that is
    // "unknown", not "empty company", and must not become a startup band.
    headcount: typeof headcount === "number" && headcount > 0 ? headcount : null,
    foundedYear: data.organization?.founded_year ?? null,
  };
}
