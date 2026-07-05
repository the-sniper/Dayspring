import { htmlToText } from "@/lib/html";
import type { AtsAdapter } from "./types";

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string } | null;
  first_published?: string | null;
  updated_at?: string | null;
  content?: string | null; // HTML-entity-escaped HTML — needs ?content=true
};

export const fetchGreenhouse: AtsAdapter = async (slug) => {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`greenhouse/${slug}: HTTP ${res.status}`);
  const data = (await res.json()) as { jobs?: GreenhouseJob[] };
  return (data.jobs ?? []).map((j) => ({
    externalId: String(j.id),
    title: j.title,
    url: j.absolute_url,
    location: j.location?.name ?? null,
    postedAt: j.first_published ?? j.updated_at ?? null,
    descriptionText: j.content ? htmlToText(j.content) : "",
  }));
};
