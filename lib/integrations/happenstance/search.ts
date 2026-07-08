import { hpFetch, pollUntilDone } from "./client";

export type HappenstancePerson = {
  happenstanceId: string;
  name: string;
  title: string | null;
  company: string | null;
  summary: string | null;
  linkedin: string | null;
  twitter: string | null;
  mutuals: string[];
};

type RawPerson = {
  id: string;
  name?: string | null;
  current_title?: string | null;
  current_company?: string | null;
  summary?: string | null;
  socials?: { linkedin?: string | null; twitter?: string | null } | null;
  mutuals?: (string | { name?: string | null })[] | null;
};

type SearchJob = {
  id: string;
  status?: string;
  results?: RawPerson[];
  has_more?: boolean;
  next_page?: string | null;
};

function normalize(p: RawPerson): HappenstancePerson {
  return {
    happenstanceId: p.id,
    name: p.name?.trim() || "(unnamed)",
    title: p.current_title ?? null,
    company: p.current_company ?? null,
    summary: p.summary ?? null,
    linkedin: p.socials?.linkedin ?? null,
    twitter: p.socials?.twitter ?? null,
    mutuals: (p.mutuals ?? [])
      .map((m) => (typeof m === "string" ? m : (m?.name ?? "")))
      .filter(Boolean),
  };
}

// Natural-language search over YOUR OWN network. Costs 2 Happenstance credits.
export async function searchNetwork({
  text,
  includeMine = true,
  includeFriends = false,
}: {
  text: string;
  includeMine?: boolean;
  includeFriends?: boolean;
}): Promise<{ people: HappenstancePerson[]; hasMore: boolean }> {
  const started = await hpFetch<SearchJob>("POST", "/v1/search", {
    text,
    include_my_connections: includeMine,
    include_friends_connections: includeFriends,
  });

  // Fast jobs return results inline; otherwise poll the search by id.
  const job =
    (started.status ?? "COMPLETED").toUpperCase() === "RUNNING"
      ? await pollUntilDone<SearchJob>(`/v1/search/${started.id}`)
      : started;

  return {
    people: (job.results ?? []).map(normalize),
    hasMore: !!job.has_more,
  };
}
