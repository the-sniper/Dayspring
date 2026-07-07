import { htmlToText } from "@/lib/html";
import type { AtsAdapter } from "./types";

type AshbyPosting = {
  id: string;
  title: string;
  jobUrl: string;
  location?: string | null;
  publishedAt?: string | null;
  isListed?: boolean;
  descriptionPlain?: string | null;
  descriptionHtml?: string | null;
};

export const fetchAshby: AtsAdapter = async (slug) => {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
    {
      signal: AbortSignal.timeout(30_000),
      headers: { accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`ashby/${slug}: HTTP ${res.status}`);
  const data = (await res.json()) as { jobs?: AshbyPosting[] };
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      externalId: j.id,
      title: j.title,
      url: j.jobUrl,
      location: j.location ?? null,
      postedAt: j.publishedAt ?? null,
      descriptionText:
        j.descriptionPlain ??
        (j.descriptionHtml ? htmlToText(j.descriptionHtml) : ""),
    }));
};
