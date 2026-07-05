import type { RoleType } from "@/lib/types";

// First match wins — ordered specific → general. Titles that miss every
// pattern return null and get batched through the cheap Claude classifier
// after a pull (or set manually on the job detail page).
const RULES: [RoleType, RegExp][] = [
  [
    "FDE",
    /forward[- ]deployed|solutions? (engineer|architect)|field engineer|customer engineer/i,
  ],
  [
    "DATA",
    /data (engineer|scientist|analyst)|machine learning|\bml (engineer|scientist)\b|analytics/i,
  ],
  ["FE", /front[- ]?end|\bui engineer\b|react|design engineer/i],
  [
    "BE",
    /back[- ]?end|platform engineer|infrastructure|distributed|api engineer|site reliability|devops/i,
  ],
  ["FS", /full[- ]?stack|product engineer|generalist/i],
];

export function heuristicRoleType(title: string): RoleType | null {
  for (const [role, re] of RULES) {
    if (re.test(title)) return role;
  }
  return null;
}
