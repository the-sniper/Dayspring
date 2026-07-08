import { htmlToText } from "@/lib/html";
import type { NormalizedJob } from "./types";

// Workday's public CxS jobs API. Unlike the bare-slug ATSes, Workday needs
// three values (tenant + wd{N} datacenter + site), so this is a factory, not
// an AtsAdapter — resolved per-company in lib/jobs/pull.ts.
export type WorkdayLocator = { tenant: string; host: string; site: string };

type WorkdayPosting = {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
};

type ListResponse = { total?: number; jobPostings?: WorkdayPosting[] };

type DetailResponse = {
  jobPostingInfo?: {
    jobDescription?: string;
    startDate?: string;
    location?: string;
  };
};

const PAGE = 20;
const MAX_PAGES = 25; // 500 postings cap — plenty for a watched company

function base({ tenant, host, site }: WorkdayLocator): string {
  return `https://${tenant}.${host}.myworkdayjobs.com`;
}

export async function fetchWorkday(loc: WorkdayLocator): Promise<NormalizedJob[]> {
  const { tenant, site } = loc;
  const cxs = `${base(loc)}/wday/cxs/${tenant}/${site}`;
  const all: WorkdayPosting[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${cxs}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ limit: PAGE, offset: page * PAGE, searchText: "", appliedFacets: {} }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`workday/${tenant}: HTTP ${res.status}`);
    const data = (await res.json()) as ListResponse;
    const batch = data.jobPostings ?? [];
    all.push(...batch);
    if (batch.length < PAGE || all.length >= (data.total ?? Infinity)) break;
  }

  // Fetch descriptions concurrently but politely (small pool).
  const out: NormalizedJob[] = [];
  const pool = 4;
  for (let i = 0; i < all.length; i += pool) {
    const slice = all.slice(i, i + pool);
    const detailed = await Promise.all(
      slice.map(async (p) => {
        const path = p.externalPath ?? "";
        let descriptionText = (p.bulletFields ?? []).join(" · ");
        try {
          const dRes = await fetch(`${cxs}${path}`, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(20_000),
            cache: "no-store",
          });
          if (dRes.ok) {
            const d = (await dRes.json()) as DetailResponse;
            if (d.jobPostingInfo?.jobDescription) {
              descriptionText = htmlToText(d.jobPostingInfo.jobDescription);
            }
          }
        } catch {
          // keep the bulletFields fallback
        }
        return {
          externalId: path || p.title || "",
          title: p.title ?? "(untitled)",
          url: `${base(loc)}/${site}${path}`,
          location: p.locationsText ?? null,
          postedAt: p.postedOn ?? null,
          descriptionText,
        } satisfies NormalizedJob;
      }),
    );
    out.push(...detailed);
  }
  return out;
}
