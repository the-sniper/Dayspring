import { htmlToText } from "@/lib/html";
import type { AtsAdapter } from "./types";

type LeverPosting = {
  id: string;
  text: string; // title
  hostedUrl: string;
  createdAt?: number | string | null; // epoch ms
  categories?: { location?: string | null } | null;
  descriptionPlain?: string | null;
  description?: string | null;
};

// Lever's unpaginated endpoint can take minutes for large boards (4MB+
// payloads generated server-side), so we page through with limit/skip.
// The API is also intermittently slow/flaky, so each page gets one retry.
const PAGE_SIZE = 100;
const MAX_PAGES = 30;
const PAGE_ATTEMPTS = 2;

async function fetchPage(slug: string, page: number): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PAGE_ATTEMPTS; attempt++) {
    try {
      return await fetch(
        `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json&limit=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`,
        {
          signal: AbortSignal.timeout(30_000),
          headers: { accept: "application/json" },
          cache: "no-store",
        },
      );
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export const fetchLever: AtsAdapter = async (slug) => {
  const data: LeverPosting[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchPage(slug, page);
    if (!res.ok) throw new Error(`lever/${slug}: HTTP ${res.status}`);
    const batch = (await res.json()) as LeverPosting[];
    if (!Array.isArray(batch)) {
      throw new Error(`lever/${slug}: unexpected response shape`);
    }
    data.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return data.map((j) => {
    const created = Number(j.createdAt);
    return {
      externalId: j.id,
      title: j.text,
      url: j.hostedUrl,
      location: j.categories?.location ?? null,
      postedAt: Number.isFinite(created) && created > 0
        ? new Date(created).toISOString()
        : null,
      descriptionText:
        j.descriptionPlain ?? (j.description ? htmlToText(j.description) : ""),
    };
  });
};
