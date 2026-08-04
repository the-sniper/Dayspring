// The employee registry — the org chart as data (final plan §3). The /company/
// team pages render this; the run engine hires from it as phases unlock.
//
// `id` is the STABLE role key (matches orchTasks.role, charters, ledger rows) —
// never rename it. `name`/`avatar` are pure display and theme-able in this one
// file. The portraits are Harry Potter character promotional images, sourced
// from the Harry Potter Wiki / HP API. Replace them with licensed local assets
// before distributing the product commercially.
import type { ModelRole } from "@/lib/orchestra/tiers";

export type Employee = {
  id: string; // stable role key — matches orchTasks.role
  name: string; // display name (theme-able)
  avatar?: string; // display avatar URL (theme-able)
  avatarFocus?: string; // object-position for mixed portrait source crops
  avatarZoom?: number; // scale for mixed portrait source crops
  title: string;
  team: "Executive" | "GTM & Socials" | "Ops & Quality" | "Product & Eng";
  managerId: string | null; // null = reports to the CEO (you)
  modelRole: ModelRole | "code"; // "code" = no model at all (pure functions)
  status: "active" | "planned";
  phase: 1 | 2 | 3 | 4 | 5;
  responsibilities: string[];
};

export const EMPLOYEES: Employee[] = [
  {
    id: "atlas",
    name: "Dumbledore",
    avatar: "/avatars/atlas.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Chief of Staff (orchestrator)",
    team: "Executive",
    managerId: null,
    modelRole: "lead",
    status: "active",
    phase: 1,
    responsibilities: [
      "Turns your goals into task contracts and assigns them",
      "Never does object-level work; plans it and accounts for it",
      "Compiles the daily report that lands in your digest",
      "Escalates anything unresolved, over budget, or two-strike",
    ],
  },
  {
    id: "radar",
    name: "Hermione",
    avatar: "/avatars/radar.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Market & Opportunity Researcher",
    team: "GTM & Socials",
    managerId: "atlas",
    modelRole: "worker",
    status: "active",
    phase: 1,
    responsibilities: [
      "Scans the job feed + the web for brand/job/project opportunities",
      "Every claim cites a source seen this run — 'not found' over inference",
      "Zero-opportunity days are a valid, reportable result",
    ],
  },
  {
    id: "sentinel",
    name: "Ginny",
    avatar: "/avatars/sentinel.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Independent Verifier",
    team: "Ops & Quality",
    managerId: "atlas",
    modelRole: "lead",
    status: "active",
    phase: 1,
    responsibilities: [
      "Adversarially verifies every deliverable before it reaches you",
      "Claims vs sources, DoD vs evidence, envelope honesty",
      "Sole path to 'verified' — the doer can never self-certify",
      "Audited by you: weekly random re-checks of its confirms",
    ],
  },
  {
    id: "ledger",
    name: "Gringotts",
    avatar: "/avatars/ledger.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Cost & Budget Enforcement",
    team: "Ops & Quality",
    managerId: "atlas",
    modelRole: "code",
    status: "active",
    phase: 1,
    responsibilities: [
      "Pure code, not a model — meters every call, sums every day",
      "Hard-stops the company at the daily cap ($5 default)",
    ],
  },
  {
    id: "compass",
    name: "Ron",
    avatar: "/avatars/compass.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "GTM Lead (strategy)",
    team: "GTM & Socials",
    managerId: "atlas",
    modelRole: "lead",
    status: "active",
    phase: 2,
    responsibilities: [
      "Owns positioning: decides today's post angles from the research brief",
      "Every decision is an auditable memo; choosing silence is a decision",
    ],
  },
  {
    id: "quill",
    name: "Luna",
    avatar: "/avatars/quill.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Content Writer (LinkedIn/X)",
    team: "GTM & Socials",
    managerId: "compass",
    modelRole: "worker",
    status: "active",
    phase: 2,
    responsibilities: [
      "Drafts posts in your voice from the strategy memos",
      "One writer per deliverable; every claim traces to a research citation",
      "Nothing posts without your tap",
    ],
  },
  {
    id: "delve",
    name: "Cho",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Deep Research Analyst",
    team: "GTM & Socials",
    managerId: "compass",
    modelRole: "worker",
    status: "active",
    phase: 2,
    responsibilities: [
      "One topic, one researcher — runs in parallel across the whole shortlist",
      "Stats, named examples, contrarian reads; every number carries its source",
      "A thin topic comes back 'blocked' instead of padded",
    ],
  },
  {
    id: "spark",
    name: "Sirius",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Hook Specialist",
    team: "GTM & Socials",
    managerId: "compass",
    modelRole: "worker",
    status: "active",
    phase: 2,
    responsibilities: [
      "Five distinct hooks per topic — you pick the one that sounds like you",
      "One batched call for the whole campaign, not one per topic",
      "Never invents an experience to make a hook land",
    ],
  },
  {
    id: "hone",
    name: "McGonagall",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Style Editor",
    team: "GTM & Socials",
    managerId: "compass",
    modelRole: "worker",
    status: "active",
    phase: 2,
    responsibilities: [
      "The last read before yours: tightens, de-AIs, enforces the format rules",
      "Cannot add a fact, lengthen a post, or replace your chosen hook",
      "Reports every edit it made — 'no changes needed' is a valid answer",
    ],
  },
  {
    id: "easel",
    name: "Colin",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Art Director",
    team: "GTM & Socials",
    managerId: "compass",
    modelRole: "worker",
    status: "active",
    phase: 2,
    responsibilities: [
      "Writes the image brief when a post needs a visual — you generate it",
      "Charts and diagrams only from numbers already in the post",
      "Never calls an image model; the prompt IS the deliverable",
    ],
  },
  {
    id: "pulse",
    name: "Percy",
    avatar: "/avatars/pulse.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Content Analyst",
    team: "GTM & Socials",
    managerId: "compass",
    modelRole: "grunt",
    status: "active",
    phase: 2,
    responsibilities: [
      "Reviews published posts, your metrics, and your rejections",
      "Says 'insufficient data' rather than inventing an audience insight",
      "Proposes memory edits with evidence — you apply them, it can't",
    ],
  },
  {
    id: "herald",
    name: "Hedwig",
    avatar: "/avatars/herald.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Outreach Researcher",
    team: "GTM & Socials",
    managerId: "compass",
    modelRole: "worker",
    status: "active",
    phase: 3,
    responsibilities: [
      "Researches reachable contacts; drafts into the outreach queue",
      "Zero send capability and zero credit spend by design",
      "Citation-gated personalization: no source, no claim",
    ],
  },
  {
    id: "forge",
    name: "Fred & George",
    avatar: "/avatars/forge.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Tech Lead",
    team: "Product & Eng",
    managerId: "atlas",
    modelRole: "lead",
    status: "active",
    phase: 4,
    responsibilities: [
      "Turns feature goals into repo-grounded specs with acceptance criteria",
      "Reads the actual codebase before speccing",
    ],
  },
  {
    id: "mason",
    name: "Hagrid",
    avatar: "/avatars/mason.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Builder (a Claude Code session)",
    team: "Product & Eng",
    managerId: "forge",
    modelRole: "code",
    status: "active",
    phase: 4,
    responsibilities: [
      "Your Claude Code session, working from the spec — flat-rate, not metered",
      "Implements in the working tree; review gates before any commit",
    ],
  },
  {
    id: "probe",
    name: "Snape",
    avatar: "/avatars/probe.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Test & Review",
    team: "Product & Eng",
    managerId: "forge",
    modelRole: "lead",
    status: "active",
    phase: 4,
    responsibilities: [
      "Adversarial code review — tries to refute 'done'",
      "Layer 0 is deterministic: typecheck + tests are free and non-negotiable",
    ],
  },
  {
    id: "vigil",
    name: "Dobby",
    avatar: "/avatars/vigil.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Platform Watcher",
    team: "Ops & Quality",
    managerId: "atlas",
    modelRole: "code",
    status: "active",
    phase: 5,
    responsibilities: [
      "Pure code: fingerprints profile, resumes, watchlist, memory, and tier every run",
      "Diffs against the last run — changes go into the day's plan and your report",
      "Change your context anywhere and the whole loop adapts next run",
    ],
  },
  {
    id: "archive",
    name: "Neville",
    avatar: "/avatars/archive.png",
    avatarFocus: "50% 50%",
    avatarZoom: 1.0,
    title: "Librarian / Memory",
    team: "Ops & Quality",
    managerId: "atlas",
    modelRole: "code",
    status: "active",
    phase: 2,
    responsibilities: [
      "Pure code: rejection reasons auto-file into the lessons memory",
      "Lessons capped at ~40 lines so memory stays read, not archived",
      "You edit brand-voice / banned-topics on the Team page",
    ],
  },
];

export const TEAMS = [
  "Executive",
  "GTM & Socials",
  "Ops & Quality",
  "Product & Eng",
] as const;

const byId = new Map(EMPLOYEES.map((e) => [e.id, e]));

export function employee(id: string): Employee | undefined {
  return byId.get(id);
}

// Display name for a role key ("radar" → "Hermione"); falls back to the key.
export function displayName(roleId: string): string {
  return byId.get(roleId)?.name ?? roleId;
}

// Stable role keys used in charters, task objectives, and model prompts.
// Rewriting these → display names keeps the HP theme in one place (this file)
// without renaming orchTasks.role / ledger keys.
const CODENAMES = [
  "atlas",
  "radar",
  "sentinel",
  "compass",
  "quill",
  "delve",
  "spark",
  "hone",
  "easel",
  "pulse",
  "herald",
  "forge",
  "mason",
  "probe",
  "vigil",
  "ledger",
  "archive",
] as const;

/** Rewrite role codenames (Atlas/Radar/…) to current display names. */
export function themeCodenames(text: string): string {
  let out = text;
  for (const id of CODENAMES) {
    const name = displayName(id);
    const re = new RegExp(`\\b${id}\\b`, "gi");
    out = out.replace(re, (match) => {
      if (match === match.toUpperCase() && match.length > 1) {
        return name.toUpperCase();
      }
      return name;
    });
  }
  return out;
}

export function reportsToLabel(e: Employee): string {
  if (!e.managerId) return "You (CEO)";
  return byId.get(e.managerId)?.name ?? e.managerId;
}

export function directReports(id: string | null): Employee[] {
  return EMPLOYEES.filter((e) => e.managerId === id);
}
