// Seniority detection from a job title. Shared by Convex functions (pull,
// backfill, feed) and the Next app (filters, badges) — convex/tsconfig
// already includes ../shared.
//
// `rank` is NOT pure seniority; it is distance from an early-career candidate,
// which is the axis the feed actually filters on. People-management roles sit
// above senior ICs because they are harder to land without a track record,
// even though a Staff IC may out-rank a first-line Manager on a real ladder.

export const LEVELS = [
  "intern",
  "entry",
  "mid",
  "senior",
  "staff",
  "principal",
  "manager",
  "director",
  "exec",
] as const;

export type Level = (typeof LEVELS)[number];

export const LEVEL_RANK: Record<Level, number> = {
  intern: 0,
  entry: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  principal: 5,
  manager: 6,
  director: 7,
  exec: 8,
};

export const LEVEL_LABELS: Record<Level, string> = {
  intern: "Intern",
  entry: "New grad / Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
  manager: "Manager",
  director: "Director",
  exec: "VP / Exec",
};

// Leadership roles are the ones a candidate without direct-report history
// effectively cannot win, regardless of engineering strength.
export const LEADERSHIP_LEVELS: Level[] = ["manager", "director", "exec"];

// Ordered most-specific first. Each pattern must be anchored on word
// boundaries so "Principal" doesn't match "Principles" and, more importantly,
// "Senior" inside "Senior Director" doesn't win over "Director".
const PATTERNS: [Level, RegExp][] = [
  // "partner" is deliberately absent — "Partner Solutions Engineer" is an IC
  // role and matching it as exec would hide a reachable job.
  ["exec", /\b(chief|c[teoif]o|cxo|svp|evp|vp|vice[-\s]president|head of|president)\b/i],
  ["director", /\b(director|dir\.)\b/i],
  ["manager", /\b(manager|mgr\.?|management|people lead|engineering lead|team lead)\b/i],
  ["principal", /\b(principal|distinguished|fellow|architect emeritus)\b/i],
  ["staff", /\b(staff|senior staff|sr\.? staff)\b/i],
  ["senior", /\b(senior|sr\.?|snr\.?|experienced|lead)\b/i],
  ["mid", /\b(intermediate|mid[-\s]?level|ii|iii)\b/i],
  ["entry", /\b(junior|jr\.?|entry[-\s]?level|new ?grad|university ?grad|graduate|associate|apprentice|early career|campus|rotational|i)\b/i],
  ["intern", /\b(intern|internship|co[-\s]?op|trainee|placement|summer analyst)\b/i],
];

/**
 * Detect the level a title is reachable at.
 *
 * When a title spans a band ("Intermediate/Senior/Staff Backend Engineer",
 * which GitLab posts constantly) we return the LOWEST match, because you can
 * apply at the bottom of the range — treating that posting as Staff-only
 * would wrongly hide a genuinely reachable job.
 *
 * Leadership titles are the exception: "Senior Engineering Manager" is a
 * manager role, not a senior IC role, so a leadership match always wins over
 * any IC match regardless of which is lower.
 */
export function detectLevel(title: string): Level | null {
  const matched: Level[] = [];
  for (const [level, re] of PATTERNS) {
    if (re.test(title)) matched.push(level);
  }
  if (matched.length === 0) return null;

  const leadership = matched.filter((l) => LEADERSHIP_LEVELS.includes(l));
  const pool = leadership.length > 0 ? leadership : matched;
  // Highest rank among leadership matches (Director beats Manager), lowest
  // rank among IC matches (the reachable end of a banded posting).
  return leadership.length > 0
    ? pool.reduce((a, b) => (LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b))
    : pool.reduce((a, b) => (LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b));
}

// A job with no level signal at all ("DevRel Engineer, Agentic
// Infrastructure") is treated as mid — the common default for an unqualified
// engineering title.
export function levelOrDefault(title: string): Level {
  return detectLevel(title) ?? "mid";
}

export function isLeadership(level: Level | null | undefined): boolean {
  return !!level && LEADERSHIP_LEVELS.includes(level);
}
