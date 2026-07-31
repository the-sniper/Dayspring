// Company size bands. The feed filters on these because headcount is the
// closest available proxy for applicant competition: a 40-person Series A
// posting and a 6,000-person public-company posting are not the same job
// market, even for an identical title.
//
// Headcount comes from Apollo organization enrichment (1 credit/company,
// `estimated_num_employees`); companies with no enrichment yet have no band
// and are never silently filtered out.

export const SIZE_BANDS = ["startup", "small", "mid", "large", "mega"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];

export const SIZE_LABELS: Record<SizeBand, string> = {
  startup: "Startup (1–50)",
  small: "Small (51–200)",
  mid: "Mid (201–1,000)",
  large: "Large (1,001–5,000)",
  mega: "Enterprise (5,000+)",
};

// Short form for table badges, where the full label doesn't fit.
export const SIZE_SHORT: Record<SizeBand, string> = {
  startup: "1–50",
  small: "51–200",
  mid: "201–1k",
  large: "1k–5k",
  mega: "5k+",
};

const BANDS: [SizeBand, number][] = [
  ["startup", 50],
  ["small", 200],
  ["mid", 1000],
  ["large", 5000],
];

export function sizeBand(headcount: number | null | undefined): SizeBand | null {
  if (headcount === null || headcount === undefined || !Number.isFinite(headcount)) {
    return null;
  }
  if (headcount <= 0) return null;
  for (const [band, max] of BANDS) {
    if (headcount <= max) return band;
  }
  return "mega";
}

// What the user asked to target: startups through mid-size. Used as the
// default selection for the feed's company-size filter.
export const DEFAULT_TARGET_BANDS: SizeBand[] = ["startup", "small", "mid"];

// Headcount ceiling the PULL enforces, so big-company boards never consume the
// per-pull job budget. null = no ceiling. Distinct from the feed filter: this
// one decides what gets ingested at all, not merely what is displayed.
export const DEFAULT_MAX_HEADCOUNT = 1000;

export const MAX_HEADCOUNT_OPTIONS: [number | null, string][] = [
  [50, "Startups only (≤50)"],
  [200, "Up to small (≤200)"],
  [1000, "Up to mid-size (≤1,000)"],
  [5000, "Up to large (≤5,000)"],
  [null, "No limit — pull everything"],
];
