// Hiring-team reach: contact roles + message channels for the /reach flow.

export const REACH_CONTACT_ROLES = [
  "recruiter",
  "hiring_manager",
  "teammate",
  "point_of_contact",
  "other",
] as const;
export type ReachContactRole = (typeof REACH_CONTACT_ROLES)[number];

export const REACH_CONTACT_ROLE_LABELS: Record<ReachContactRole, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  teammate: "Teammate",
  point_of_contact: "Point of contact",
  other: "Contact",
};

export const REACH_CHANNELS = [
  "cold_dm",
  "warm_dm",
  "email",
  "linkedin",
] as const;
export type ReachChannel = (typeof REACH_CHANNELS)[number];

export const REACH_CHANNEL_LABELS: Record<ReachChannel, string> = {
  cold_dm: "Cold DM",
  warm_dm: "Warm DM",
  email: "Email",
  linkedin: "LinkedIn",
};

export const REACH_CHANNEL_HINTS: Record<ReachChannel, string> = {
  cold_dm: "Connection note · ≤300 characters",
  warm_dm: "Message to someone you already know",
  email: "Full email with subject",
  linkedin: "Longer LinkedIn / InMail message",
};

// Default Apollo title queries for hiring-team discovery.
export const REACH_RECRUITER_TITLES = [
  "technical recruiter",
  "talent acquisition",
  "recruiting coordinator",
  "sourcer",
  "people partner",
];

export const REACH_HM_TITLES_BY_ROLE: Record<string, string[]> = {
  FDE: ["solutions engineering manager", "engineering manager"],
  FE: ["engineering manager", "frontend engineering manager"],
  BE: ["engineering manager", "backend engineering manager"],
  FS: ["engineering manager", "software engineering manager"],
  DATA: ["data engineering manager", "head of data", "engineering manager"],
  AIML: ["ml engineering manager", "head of ai", "engineering manager"],
  INFRA: ["infrastructure engineering manager", "platform engineering manager"],
  SEC: ["security engineering manager", "head of security"],
  QA: ["qa manager", "engineering manager"],
  EMB: ["hardware engineering manager", "engineering manager"],
  XR: ["engineering manager"],
  GAME: ["engineering manager", "game director"],
  MOBILE: ["mobile engineering manager", "engineering manager"],
  PM: ["product manager", "group product manager", "head of product"],
  DESIGN: ["design manager", "head of design"],
};

export const REACH_TEAMMATE_TITLES_BY_ROLE: Record<string, string[]> = {
  FDE: ["solutions engineer", "forward deployed engineer"],
  FE: ["frontend engineer", "software engineer"],
  BE: ["backend engineer", "software engineer"],
  FS: ["software engineer", "fullstack engineer"],
  DATA: ["data engineer", "data scientist"],
  AIML: ["machine learning engineer", "ai engineer"],
  INFRA: ["devops engineer", "site reliability engineer"],
  SEC: ["security engineer"],
  QA: ["qa engineer"],
  EMB: ["embedded engineer"],
  XR: ["xr engineer"],
  GAME: ["game developer"],
  MOBILE: ["ios engineer", "android engineer"],
  PM: ["product manager"],
  DESIGN: ["product designer"],
};
