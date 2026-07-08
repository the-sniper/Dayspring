import { hpFetch, pollUntilDone } from "./client";

export type HappenstanceProfile = {
  summary: string | null;
  url: string | null;
  employment: { company: string | null; title: string | null; dates: string | null }[];
  education: { school: string | null; degree: string | null }[];
};

type ResearchStart = { id: string; url?: string | null };

type ResearchJob = {
  id: string;
  status?: string;
  profile?: {
    summary?: string | null;
    person_metadata?: { profile_urls?: string[] | null } | null;
    employment?: {
      company?: string | null;
      title?: string | null;
      start_date?: string | null;
      end_date?: string | null;
    }[];
    education?: { university?: string | null; degree?: string | null }[];
  } | null;
};

// Deep profile compilation for one person. Costs 1 Happenstance credit.
export async function researchPerson({
  description,
}: {
  description: string;
}): Promise<HappenstanceProfile> {
  const started = await hpFetch<ResearchStart>("POST", "/v1/research", {
    description,
  });
  const job = await pollUntilDone<ResearchJob>(`/v1/research/${started.id}`, {
    timeoutMs: 90_000,
  });
  if ((job.status ?? "").toUpperCase().startsWith("FAILED")) {
    throw new Error(
      "Happenstance couldn't resolve that person — add company/location to disambiguate.",
    );
  }
  const p = job.profile;
  return {
    summary: p?.summary ?? null,
    url: started.url ?? p?.person_metadata?.profile_urls?.[0] ?? null,
    employment: (p?.employment ?? []).map((e) => ({
      company: e.company ?? null,
      title: e.title ?? null,
      dates: [e.start_date, e.end_date].filter(Boolean).join(" – ") || null,
    })),
    education: (p?.education ?? []).map((e) => ({
      school: e.university ?? null,
      degree: e.degree ?? null,
    })),
  };
}
