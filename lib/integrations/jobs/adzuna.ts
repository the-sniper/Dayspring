// Adzuna aggregator client — broad, cross-industry US job coverage for the
// long tail that isn't on a watched ATS board. Free tier: register an app at
// developer.adzuna.com for an app_id + app_key. Env-guarded: no keys ⇒ no-op.
//
// Unlike an ATS adapter (which is scoped to one company), aggregator results
// span many employers, so each normalized job carries its own companyName;
// lib/jobs/pull.ts resolves that to a company row via findOrCreateCompany.

export type AggregatorJob = {
  externalId: string;
  companyName: string;
  title: string;
  url: string;
  location: string | null;
  postedAt: string | null;
  descriptionText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  category: string | null;
};

type AdzunaResult = {
  id?: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  company?: { display_name?: string } | null;
  location?: { display_name?: string } | null;
  category?: { label?: string } | null;
};

export function hasAdzunaKeys(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

function envQueries(): string[] {
  return (process.env.ADZUNA_QUERIES ?? "")
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean);
}

function config(queries: string[]) {
  return {
    appId: process.env.ADZUNA_APP_ID!,
    appKey: process.env.ADZUNA_APP_KEY!,
    queries,
    maxDays: Number(process.env.ADZUNA_MAX_DAYS ?? 15) || 15,
    pages: Math.max(1, Number(process.env.ADZUNA_PAGES ?? 2) || 2),
  };
}

async function fetchPage(
  query: string,
  page: number,
  cfg: ReturnType<typeof config>,
): Promise<AdzunaResult[]> {
  const params = new URLSearchParams({
    app_id: cfg.appId,
    app_key: cfg.appKey,
    results_per_page: "50",
    what: query,
    max_days_old: String(cfg.maxDays),
    "content-type": "application/json",
  });
  const res = await fetch(
    `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`,
    { signal: AbortSignal.timeout(30_000), headers: { accept: "application/json" }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`adzuna/${query} p${page}: HTTP ${res.status}`);
  const data = (await res.json()) as { results?: AdzunaResult[] };
  return data.results ?? [];
}

// Fetch across every configured query + page, normalize, and dedupe by Adzuna
// id (the same posting often surfaces under multiple query terms).
// Prefer caller-supplied queries (from onboarding role types). Env override
// still wins when set; empty caller list falls back to a tech-only default.
export async function fetchAdzuna(
  preferredQueries: string[] = [],
): Promise<AggregatorJob[]> {
  if (!hasAdzunaKeys()) return [];
  const fromEnv = envQueries();
  const queries =
    fromEnv.length > 0
      ? fromEnv
      : preferredQueries.length > 0
        ? preferredQueries
        : ["software engineer"];
  const cfg = config(queries);
  const byId = new Map<string, AggregatorJob>();

  for (const query of cfg.queries) {
    for (let page = 1; page <= cfg.pages; page++) {
      let results: AdzunaResult[];
      try {
        results = await fetchPage(query, page, cfg);
      } catch {
        break; // stop paginating this query on error; other queries continue
      }
      if (results.length === 0) break;
      for (const r of results) {
        const id = r.id != null ? String(r.id) : null;
        const company = r.company?.display_name?.trim();
        const title = r.title?.trim();
        const url = r.redirect_url?.trim();
        if (!id || !company || !title || !url || byId.has(id)) continue;
        byId.set(id, {
          externalId: id,
          companyName: company,
          title,
          url,
          location: r.location?.display_name?.trim() || null,
          postedAt: r.created ?? null,
          descriptionText: r.description?.trim() ?? "",
          salaryMin: typeof r.salary_min === "number" ? Math.round(r.salary_min) : null,
          salaryMax: typeof r.salary_max === "number" ? Math.round(r.salary_max) : null,
          category: r.category?.label?.trim() || null,
        });
      }
    }
  }

  return [...byId.values()];
}
