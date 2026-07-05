// The hub-and-spoke seam: every listings source implements AtsAdapter and
// registers here. Apollo / Gmail integrations land as sibling directories.
import type { AtsType } from "@/lib/types";
import { fetchAshby } from "./ashby";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import type { AtsAdapter } from "./types";

export const adapters: Record<AtsType, AtsAdapter> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

export type { AtsAdapter, NormalizedJob } from "./types";
