// Pull-time relevance gates. Shared by the Next pull core and the Convex
// hosted pull so aggregator noise (truck drivers, nurses, clerks…) never
// spends the per-pull budget or pollutes the feed.
import {
  heuristicRoleType,
  ROLE_TYPE_LABELS,
  type RoleType,
} from "./role-types";

// Confirmed non-tech occupations. First-line defense against Adzuna's broad
// query matches before the role classifier spends a token.
const OFF_DOMAIN: RegExp[] = [
  /\b(rn|registered nurse|\blpn\b|\bcna\b|nursing|nurse)\b/i,
  /\b(truck|cdl|owner[- ]?operator|class a\b|delivery driver|courier)\b/i,
  /\b(clerk|cashier|barista|waiter|waitress|hostess|food server)\b/i,
  /\b(warehouse|forklift|picker|packer|material handler)\b/i,
  /\b(realtor|real estate agent|loan officer|mortgage banker)\b/i,
  /\b(dental|hygienist|physician|pharmacist|therapist|paramedic|surgeon)\b/i,
  /\b(mechanic|welder|plumber|hvac|carpenter|electrician)\b/i,
  /\b(cook|chef|dishwasher|housekeeper|janitor|custodian)\b/i,
  /\b(retail associate|store associate|shift supervisor)\b/i,
  /\b(teacher|paralegal|attorney|lawyer|accountant)\b/i,
  // Hardware / physical engineering that is not our software taxonomy.
  /\bmechanical engineer(ing)?\b/i,
  /\bcivil engineer(ing)?\b/i,
  /\bchemical engineer(ing)?\b/i,
  /\bstructural engineer(ing)?\b/i,
  /\bantenna\b/i,
  /\bowner operator\b/i,
];

// Positive signals that an unclassified title is still tech-shaped enough to
// keep for the cheap classifier (e.g. "Staff Engineer", "Platform Lead").
const TECH_SIGNAL: RegExp[] = [
  /\b(software|fullstack|full[- ]stack|frontend|front[- ]end|backend|back[- ]end)\b/i,
  /\b(engineer|developer|programmer|\bsre\b|devops|platform)\b/i,
  /\b(machine learning|data scientist|data engineer|ml engineer|ai engineer)\b/i,
  /\b(product manager|product designer|\bux\b|ui designer)\b/i,
  /\b(security engineer|appsec|infosec|cybersecurity)\b/i,
  /\b(\bios\b|\bandroid\b|mobile|react|typescript|golang|\brust\b)\b/i,
  /\b(forward[- ]deployed|solutions engineer|site reliability)\b/i,
  /\b(qa engineer|\bsdet\b|test engineer|embedded|firmware)\b/i,
];

function asSet(roles: ReadonlySet<string> | readonly string[]): Set<string> {
  return roles instanceof Set ? roles : new Set(roles);
}

export function isObviouslyOffDomain(title: string): boolean {
  return OFF_DOMAIN.some((re) => re.test(title));
}

export function looksLikeTechTitle(title: string): boolean {
  if (isObviouslyOffDomain(title)) return false;
  if (heuristicRoleType(title)) return true;
  return TECH_SIGNAL.some((re) => re.test(title));
}

// Whether a title is worth ingesting given the user's onboarding role picks.
// - Preferred role match → keep
// - Preferred role mismatch → drop
// - Unclassified → keep only if it still looks like tech (classifier refines)
// - No prefs → still drop obvious off-domain noise
export function isTitleRelevantToRoles(
  title: string,
  preferredRoles: ReadonlySet<string> | readonly string[],
): boolean {
  if (isObviouslyOffDomain(title)) return false;
  const preferred = asSet(preferredRoles);
  const role = heuristicRoleType(title);
  if (preferred.size === 0) return looksLikeTechTitle(title);
  if (role !== null) return preferred.has(role);
  return looksLikeTechTitle(title);
}

// After the classifier returns: keep only roles the user asked for. Null /
// OTHER never survives when prefs exist.
export function roleMatchesPreferred(
  roleType: string | null | undefined,
  preferredRoles: ReadonlySet<string> | readonly string[],
): boolean {
  const preferred = asSet(preferredRoles);
  if (!roleType) return false;
  if (preferred.size === 0) return true;
  return preferred.has(roleType);
}

// Adzuna "what" queries derived from onboarding role types — replaces the old
// cross-industry defaults (marketing, sales, finance, operations…).
const ROLE_QUERIES: Record<RoleType, string[]> = {
  FS: ["software engineer", "fullstack engineer"],
  FE: ["frontend engineer", "react engineer"],
  BE: ["backend engineer", "api engineer"],
  FDE: ["forward deployed engineer", "solutions engineer"],
  DATA: ["data engineer", "data scientist"],
  AIML: ["machine learning engineer", "ai engineer"],
  INFRA: ["devops engineer", "site reliability engineer"],
  SEC: ["security engineer", "appsec engineer"],
  MOBILE: ["ios engineer", "android engineer"],
  QA: ["qa engineer", "sdet"],
  EMB: ["embedded software engineer", "firmware engineer"],
  XR: ["xr engineer", "ar vr engineer"],
  GAME: ["game engineer", "gameplay engineer"],
  PM: ["product manager", "technical product manager"],
  DESIGN: ["product designer", "ux designer"],
};

const FALLBACK_QUERIES = [
  "software engineer",
  "forward deployed engineer",
  "machine learning engineer",
  "data engineer",
  "devops engineer",
  "product manager",
];

export const MAX_ADZUNA_QUERIES = 8;

export function adzunaQueriesForRoles(roleTypes: readonly string[]): string[] {
  const roles = roleTypes.filter(
    (r): r is RoleType => r in ROLE_TYPE_LABELS,
  );
  if (roles.length === 0) return FALLBACK_QUERIES.slice();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const role of roles) {
    for (const q of ROLE_QUERIES[role] ?? [ROLE_TYPE_LABELS[role]]) {
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      if (out.length >= MAX_ADZUNA_QUERIES) return out;
    }
  }
  return out;
}
