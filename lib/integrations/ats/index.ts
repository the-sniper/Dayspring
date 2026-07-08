// The hub-and-spoke seam: every listings source implements AtsAdapter and
// registers here. Apollo / Gmail integrations land as sibling directories.
import type { AtsType } from "@/lib/types";
import { fetchAshby } from "./ashby";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import type { AtsAdapter } from "./types";

// Bare-slug ATSes only. Workday needs a three-value locator, so it's a factory
// (lib/integrations/ats/workday.ts) resolved per-company in lib/jobs/pull.ts —
// deliberately not in this registry.
export const adapters: Record<Exclude<AtsType, "workday">, AtsAdapter> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

export type { AtsAdapter, NormalizedJob } from "./types";
