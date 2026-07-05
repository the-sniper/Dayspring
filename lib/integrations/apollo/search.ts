import { apolloFetch } from "./client";

export type ApolloPerson = {
  apolloId: string;
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  emailStatus: string | null;
};

type RawPerson = {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  email_status?: string | null;
};

type SearchResponse = {
  people?: RawPerson[];
  pagination?: {
    page?: number;
    total_entries?: number;
    total_pages?: number;
  };
};

// People Search consumes ZERO Apollo credits and never returns emails —
// free to browse; email reveal is the separate, credit-consuming enrich step.
export async function searchPeople({
  domain,
  titles,
  page = 1,
}: {
  domain: string;
  titles: string[];
  page?: number;
}): Promise<{
  people: ApolloPerson[];
  page: number;
  totalEntries: number;
  totalPages: number;
}> {
  const data = await apolloFetch<SearchResponse>("mixed_people/api_search", {
    q_organization_domains_list: [domain],
    person_titles: titles,
    page,
    per_page: 25,
  });
  return {
    people: (data.people ?? []).map((p) => ({
      apolloId: p.id,
      name:
        p.name?.trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        "(unnamed)",
      title: p.title ?? null,
      linkedinUrl: p.linkedin_url ?? null,
      emailStatus: p.email_status ?? null,
    })),
    page: data.pagination?.page ?? page,
    totalEntries: data.pagination?.total_entries ?? 0,
    totalPages: data.pagination?.total_pages ?? 1,
  };
}
