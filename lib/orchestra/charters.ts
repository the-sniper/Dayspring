// Role charters + shared company preamble.
//
// Bodies live in lib/orchestra/charters/*.txt so markdown code fences never
// break TypeScript/Turbopack parsing. EDIT THE .txt FILES — do not paste
// charter prose (especially ``` fences) back into this .ts file.
//
// These strings are the CACHED PREFIX of every orchestra call: keep them
// stable (no dates, no task ids). Model assignment lives in tiers.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { themeCodenames } from "@/lib/orchestra/registry";

const DIR = join(process.cwd(), "lib/orchestra/charters");

function load(name: string): string {
  // Charters still author against stable role keys (Radar, Atlas…); rewrite to
  // the current display theme so model output matches the Team page.
  return themeCodenames(readFileSync(join(DIR, name), "utf8").trim());
}

export const COMPANY_PREAMBLE = load("company-preamble.txt");
export const ATLAS_CHARTER = load("atlas.txt");
export const RADAR_CHARTER = load("radar.txt");
export const SENTINEL_CHARTER = load("sentinel.txt");
export const COMPASS_CHARTER = load("compass.txt");
export const QUILL_CHARTER = load("quill.txt");
export const SENTINEL_CONTENT_ADDENDUM = load("sentinel-content.txt");
export const HERALD_CHARTER = load("herald.txt");
export const SENTINEL_OUTREACH_ADDENDUM = load("sentinel-outreach.txt");
// Studio campaign charters (the human-in-the-loop content pipeline).
export const RADAR_TOPICS_CHARTER = load("radar-topics.txt");
export const COMPASS_RANK_CHARTER = load("compass-rank.txt");
export const DELVE_CHARTER = load("delve.txt");
export const SPARK_CHARTER = load("spark.txt");
// Appended to QUILL_CHARTER: campaign drafting keeps the daily-run rules and
// adds the hook/format/length contract on top.
export const QUILL_CAMPAIGN_ADDENDUM = load("quill-post.txt");
export const HONE_CHARTER = load("hone.txt");
export const PULSE_CHARTER = load("pulse.txt");
export const FORGE_CHARTER = load("forge.txt");
export const PROBE_CHARTER = load("probe.txt");
export const ATLAS_RETRO_ADDENDUM = load("atlas-retro.txt");

type SystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export function buildSystem(charter: string): SystemBlock[] {
  return [
    { type: "text", text: COMPANY_PREAMBLE },
    { type: "text", text: charter, cache_control: { type: "ephemeral" } },
  ];
}
