// Ingestion-time targeting preference: the headcount ceiling the pull applies
// when choosing which watched companies to fetch from. Distinct from the feed's
// company-size filter, which only changes what is displayed after the fact.
import { getSetting, setSetting } from "@/lib/settings/store";
import { DEFAULT_MAX_HEADCOUNT } from "@/shared/company-size";

export const TARGET_MAX_HEADCOUNT_KEY = "targetMaxHeadcount";

// "none" is stored explicitly so an intentional "no ceiling" is
// distinguishable from an unset value (which falls back to the default).
export async function getTargetMaxHeadcount(): Promise<number | null> {
  const raw = await getSetting(TARGET_MAX_HEADCOUNT_KEY);
  if (raw === null) return DEFAULT_MAX_HEADCOUNT;
  if (raw === "none") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_HEADCOUNT;
}

export async function setTargetMaxHeadcount(max: number | null): Promise<void> {
  await setSetting(TARGET_MAX_HEADCOUNT_KEY, max === null ? "none" : String(max));
}
