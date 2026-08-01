import { apolloFetch } from "./client";

export type ApolloOrganization = {
  apolloId: string;
  name: string;
  domain: string | null;
  websiteUrl: string | null;
};

type RawOrg = {
  id?: string;
  name?: string | null;
  primary_domain?: string | null;
  website_url?: string | null;
};

type SearchResponse = {
  organizations?: RawOrg[];
  accounts?: RawOrg[];
};

// Organization Search costs 1 Apollo credit per page. Used only when Reach
// (or similar) needs to resolve a company name → domain automatically.
export async function searchOrganizationsByName(
  name: string,
  opts: { page?: number; perPage?: number } = {},
): Promise<ApolloOrganization[]> {
  const q = name.trim();
  if (!q) return [];
  const data = await apolloFetch<SearchResponse>("mixed_companies/search", {
    q_organization_name: q,
    page: opts.page ?? 1,
    per_page: opts.perPage ?? 10,
  });
  const rows = data.organizations?.length
    ? data.organizations
    : (data.accounts ?? []);
  return rows
    .map((o) => ({
      apolloId: o.id ?? "",
      name: (o.name ?? "").trim(),
      domain: cleanDomain(o.primary_domain ?? domainFromUrl(o.website_url)),
      websiteUrl: o.website_url ?? null,
    }))
    .filter((o) => o.apolloId && o.name);
}

// Best-effort name → domain. Prefers exact / near-exact name matches so
// "Air Space Intelligence" doesn't resolve to an unrelated partial hit.
export async function resolveOrganizationDomain(
  companyName: string,
): Promise<{ domain: string; name: string; apolloId: string } | null> {
  const orgs = await searchOrganizationsByName(companyName);
  if (!orgs.length) return null;

  const target = normalizeName(companyName);
  const scored = orgs
    .map((o) => ({
      org: o,
      score: nameScore(target, normalizeName(o.name)),
    }))
    .filter((x) => x.score > 0 && x.org.domain)
    .sort((a, b) => b.score - a.score || a.org.name.localeCompare(b.org.name));

  const best = scored[0];
  if (!best?.org.domain) return null;
  // Require a real name signal — not a random first result.
  if (best.score < 40) return null;
  return {
    domain: best.org.domain,
    name: best.org.name,
    apolloId: best.org.apolloId,
  };
}

function domainFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return cleanDomain(u.hostname);
  } catch {
    return cleanDomain(url);
  }
}

function cleanDomain(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? d;
  if (!d.includes(".") || /\s/.test(d)) return null;
  return d;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameScore(target: string, candidate: string): number {
  if (!target || !candidate) return 0;
  if (target === candidate) return 100;
  if (candidate.startsWith(target) || target.startsWith(candidate)) return 85;
  if (candidate.includes(target) || target.includes(candidate)) return 70;

  const t = new Set(target.split(" ").filter((w) => w.length > 1));
  const c = new Set(candidate.split(" ").filter((w) => w.length > 1));
  if (!t.size || !c.size) return 0;
  let overlap = 0;
  for (const w of t) if (c.has(w)) overlap++;
  const ratio = overlap / Math.max(t.size, c.size);
  if (ratio >= 0.8) return 60 + Math.round(ratio * 20);
  if (ratio >= 0.5) return 40 + Math.round(ratio * 15);
  return 0;
}
