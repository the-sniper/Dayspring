import type { EmploymentType } from "@/lib/types";

// Ordered specific → general. Tech postings are overwhelmingly full-time and
// rarely say so explicitly, so an absence of any signal defaults to full-time.
const RULES: [EmploymentType, RegExp][] = [
  ["internship", /\binternship\b|\bintern\b|\bco-?op\b|\bnew ?grad\b/i],
  [
    "contract",
    /\bcontract(?:or|-to-hire)?\b|\bc2c\b|\b1099\b|\bfreelance\b|\bconsultant\b|\bfixed[- ]term\b/i,
  ],
  ["part-time", /\bpart[- ]time\b/i],
  ["temporary", /\btemporary\b|\btemp\b|\bseasonal\b/i],
  ["full-time", /\bfull[- ]time\b/i],
];

export function detectEmploymentType(
  title: string,
  description?: string | null,
): EmploymentType {
  const hay = `${title}\n${description ?? ""}`;
  for (const [type, re] of RULES) {
    if (re.test(hay)) return type;
  }
  return "full-time";
}
