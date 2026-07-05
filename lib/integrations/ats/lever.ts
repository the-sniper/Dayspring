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

export const fetchLever: AtsAdapter = async (slug) => {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`lever/${slug}: HTTP ${res.status}`);
  const data = (await res.json()) as LeverPosting[];
  if (!Array.isArray(data)) throw new Error(`lever/${slug}: unexpected response shape`);
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
