// The employee registry — the org chart as data (final plan §3). The /company/
// team page renders this; the run engine hires from it as phases unlock.
// `modelRole` maps each employee to a tier slot (lib/orchestra/tiers.ts), so
// one tier switch re-models the whole company consistently.
import type { ModelRole } from "@/lib/orchestra/tiers";

export type Employee = {
  id: string; // matches orchTasks.role for active employees
  name: string;
  title: string;
  team: "Executive" | "GTM & Socials" | "Ops & Quality" | "Product & Eng";
  reportsTo: string; // display name ("You (CEO)" at the top)
  modelRole: ModelRole | "code"; // "code" = no model at all (pure functions)
  status: "active" | "planned";
  phase: 1 | 2 | 3 | 4;
  responsibilities: string[];
};

export const EMPLOYEES: Employee[] = [
  {
    id: "atlas",
    name: "Atlas",
    title: "Chief of Staff (orchestrator)",
    team: "Executive",
    reportsTo: "You (CEO)",
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
    name: "Radar",
    title: "Market & Opportunity Researcher",
    team: "GTM & Socials",
    reportsTo: "Atlas",
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
    name: "Sentinel",
    title: "Independent Verifier",
    team: "Ops & Quality",
    reportsTo: "Atlas + you (findings)",
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
    name: "Ledger",
    title: "Cost & Budget Enforcement",
    team: "Ops & Quality",
    reportsTo: "Atlas",
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
    name: "Compass",
    title: "GTM Lead (strategy)",
    team: "GTM & Socials",
    reportsTo: "Atlas",
    modelRole: "lead",
    status: "planned",
    phase: 2,
    responsibilities: [
      "Owns positioning + the weekly GTM plan from Radar/Pulse inputs",
      "Decides what to post and who to reach out to — as auditable memos",
    ],
  },
  {
    id: "quill",
    name: "Quill",
    title: "Content Writer (LinkedIn/X)",
    team: "GTM & Socials",
    reportsTo: "Compass",
    modelRole: "worker",
    status: "planned",
    phase: 2,
    responsibilities: [
      "Drafts posts in your voice from Compass's angle memos",
      "One writer per deliverable; every claim traces to a Radar citation",
      "Nothing posts without your tap",
    ],
  },
  {
    id: "pulse",
    name: "Pulse",
    title: "Analytics",
    team: "GTM & Socials",
    reportsTo: "Compass",
    modelRole: "grunt",
    status: "planned",
    phase: 2,
    responsibilities: [
      "Weekly what-worked memo from engagement + reply data",
      "Closes the loop: metrics feed the next strategy memo",
    ],
  },
  {
    id: "herald",
    name: "Herald",
    title: "Outreach Researcher",
    team: "GTM & Socials",
    reportsTo: "Compass",
    modelRole: "worker",
    status: "planned",
    phase: 3,
    responsibilities: [
      "Builds target lists via Apollo/Happenstance; researches each person",
      "Drafts into the outreach queue — zero send capability by design",
      "Citation-gated personalization: no source, no claim",
    ],
  },
  {
    id: "forge",
    name: "Forge",
    title: "Tech Lead",
    team: "Product & Eng",
    reportsTo: "Atlas",
    modelRole: "worker",
    status: "planned",
    phase: 4,
    responsibilities: [
      "Turns feature goals into specs with acceptance criteria",
      "Reviews Mason's diffs against spec",
    ],
  },
  {
    id: "mason",
    name: "Mason",
    title: "Builder",
    team: "Product & Eng",
    reportsTo: "Forge",
    modelRole: "worker",
    status: "planned",
    phase: 4,
    responsibilities: [
      "Implements against spec in a branch; tests before claiming done",
      "Output is a diff + test results, never 'I did it'",
    ],
  },
  {
    id: "probe",
    name: "Probe",
    title: "Test & Review",
    team: "Product & Eng",
    reportsTo: "Forge",
    modelRole: "worker",
    status: "planned",
    phase: 4,
    responsibilities: [
      "Adversarial code review — tries to refute 'done'",
      "Layer 0 is deterministic: typecheck + tests are free and non-negotiable",
    ],
  },
  {
    id: "archive",
    name: "Archive",
    title: "Librarian / Memory",
    team: "Ops & Quality",
    reportsTo: "Atlas",
    modelRole: "grunt",
    status: "planned",
    phase: 2,
    responsibilities: [
      "Maintains brand-voice, ICP, banned-topics, and lessons files",
      "Every lessons entry traces to a real incident",
    ],
  },
];

export const TEAMS = [
  "Executive",
  "GTM & Socials",
  "Ops & Quality",
  "Product & Eng",
] as const;
