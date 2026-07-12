import { apolloFetch } from "./client";

export type ApolloPerson = {
  apolloId: string;
  name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  linkedinUrl: string | null;
  emailStatus: string | null;
  photoUrl: string | null;
};

type RawPerson = {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  email_status?: string | null;
  photo_url?: string | null;
  organization?: { name?: string | null } | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

function normalizePerson(p: RawPerson): ApolloPerson {
  return {
    apolloId: p.id,
    name:
      p.name?.trim() ||
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
      "(unnamed)",
    title: p.title ?? null,
    company: p.organization?.name ?? null,
    location:
      [p.city, p.state, p.country].filter(Boolean).join(", ") || null,
    linkedinUrl: p.linkedin_url ?? null,
    emailStatus: p.email_status ?? null,
    photoUrl: p.photo_url?.trim() || null,
  };
}

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
    people: (data.people ?? []).map(normalizePerson),
    page: data.pagination?.page ?? page,
    totalEntries: data.pagination?.total_entries ?? 0,
    totalPages: data.pagination?.total_pages ?? 1,
  };
}

// Query-driven people search — no company/domain required. Powers "find NEW
// people relevant to my search" (cold outreach targets not yet in your network).
// Also credit-free (no emails returned); enrich is the separate paid reveal.
export async function searchPeopleFlexible({
  titles,
  locations,
  keywords,
  seniorities,
  page = 1,
}: {
  titles: string[];
  locations: string[];
  keywords?: string | null;
  seniorities?: string[];
  page?: number;
}): Promise<{
  people: ApolloPerson[];
  page: number;
  totalEntries: number;
  totalPages: number;
}> {
  const body: Record<string, unknown> = { page, per_page: 25 };
  if (titles.length) body.person_titles = titles;
  if (locations.length) body.person_locations = locations;
  if (seniorities?.length) body.person_seniorities = seniorities;
  if (keywords?.trim()) body.q_keywords = keywords.trim();

  const data = await apolloFetch<SearchResponse>("mixed_people/api_search", body);
  return {
    people: (data.people ?? []).map(normalizePerson),
    page: data.pagination?.page ?? page,
    totalEntries: data.pagination?.total_entries ?? 0,
    totalPages: data.pagination?.total_pages ?? 1,
  };
}
