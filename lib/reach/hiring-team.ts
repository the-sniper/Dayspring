import {
  searchPeopleAtCompany,
  type ApolloPerson,
} from "@/lib/integrations/apollo/search";
import { heuristicRoleType } from "@/lib/jobs/role-type";
import {
  REACH_HM_TITLES_BY_ROLE,
  REACH_RECRUITER_TITLES,
  REACH_TEAMMATE_TITLES_BY_ROLE,
  type ReachContactRole,
} from "@/shared/reach";
import type { RoleType } from "@/shared/role-types";

export type HiringTeamMember = ApolloPerson & {
  role: ReachContactRole;
  source: "apollo" | "job_posting";
};

export function titlesForHiringTeam(
  roleType: RoleType | null,
  jobTitle: string,
): { titles: string[]; roleType: RoleType | null } {
  const resolved = roleType ?? heuristicRoleType(jobTitle);
  const hm = resolved
    ? (REACH_HM_TITLES_BY_ROLE[resolved] ?? ["engineering manager"])
    : ["engineering manager", "hiring manager"];
  const peers = resolved
    ? (REACH_TEAMMATE_TITLES_BY_ROLE[resolved] ?? ["software engineer"])
    : ["software engineer"];
  // Keep the Apollo query tight — too many titles dilute results.
  const titles = [
    ...REACH_RECRUITER_TITLES.slice(0, 3),
    ...hm.slice(0, 2),
    ...peers.slice(0, 2),
  ];
  return { titles: [...new Set(titles)], roleType: resolved };
}

export async function findHiringTeam(args: {
  domain?: string | null;
  organizationName?: string | null;
  titles: string[];
  limit?: number;
}): Promise<HiringTeamMember[]> {
  const limit = args.limit ?? 8;
  const domain = args.domain?.trim() || null;
  const organizationName = args.organizationName?.trim() || null;
  if (!domain && !organizationName) return [];

  let searchMode: "domain" | "name" = domain ? "domain" : "name";
  let people = (
    await searchPeopleAtCompany({
      domain: searchMode === "domain" ? domain : null,
      organizationName: searchMode === "name" ? organizationName : null,
      titles: args.titles,
      page: 1,
    })
  ).people;

  // Wrong/empty domain (job board, stale save) → fall back to company name.
  if (people.length === 0 && domain && organizationName) {
    searchMode = "name";
    people = (
      await searchPeopleAtCompany({
        domain: null,
        organizationName,
        titles: args.titles,
        page: 1,
      })
    ).people;
  }

  const companyNorm = normalizeCompany(organizationName);
  const seen = new Set<string>();
  const out: HiringTeamMember[] = [];
  for (const p of people) {
    if (seen.has(p.apolloId)) continue;
    // Name search is fuzzy — drop people at clearly different orgs.
    if (
      searchMode === "name" &&
      companyNorm &&
      p.company &&
      nameOverlap(companyNorm, normalizeCompany(p.company)) < 0.45
    ) {
      continue;
    }
    seen.add(p.apolloId);
    out.push({
      ...p,
      role: classifyRole(p.title),
      source: "apollo",
    });
    if (out.length >= limit) break;
  }
  // Prefer recruiters + HMs ahead of peers in the UI.
  const rank: Record<ReachContactRole, number> = {
    recruiter: 0,
    hiring_manager: 1,
    point_of_contact: 2,
    teammate: 3,
    other: 4,
  };
  return out.sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));
}

function normalizeCompany(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const as = new Set(a.split(" ").filter((w) => w.length > 1));
  const bs = new Set(b.split(" ").filter((w) => w.length > 1));
  if (!as.size || !bs.size) return 0;
  let n = 0;
  for (const w of as) if (bs.has(w)) n++;
  return n / Math.max(as.size, bs.size);
}

export function classifyRole(title: string | null): ReachContactRole {
  const t = (title ?? "").toLowerCase();
  if (
    /recruit|talent acquisition|sourcer|people partner|staffing|talent partner/.test(
      t,
    )
  ) {
    return "recruiter";
  }
  if (
    /hiring manager|engineering manager|\bem\b|director of|head of|vp |vice president|group product|design manager/.test(
      t,
    )
  ) {
    return "hiring_manager";
  }
  if (/engineer|designer|scientist|developer|product manager/.test(t)) {
    return "teammate";
  }
  return "other";
}
