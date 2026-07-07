import { z } from "zod";

export const ROLE_TYPES = ["FDE", "FE", "BE", "FS", "DATA"] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

export const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  FDE: "Forward Deployed",
  FE: "Frontend",
  BE: "Backend",
  FS: "Fullstack",
  DATA: "Data",
};

// `new`/`ignored` are feed states; the rest are the kanban columns.
export const JOB_STATUSES = [
  "new",
  "ignored",
  "wishlist",
  "applied",
  "screen",
  "interview",
  "offer",
  "rejected",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const KANBAN_STATUSES = [
  "wishlist",
  "applied",
  "screen",
  "interview",
  "offer",
  "rejected",
] as const satisfies readonly JobStatus[];

export const JOB_SOURCES = [
  "greenhouse",
  "lever",
  "ashby",
  "manual",
  "csv",
  "paste",
] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const ATS_TYPES = ["greenhouse", "lever", "ashby"] as const;
export type AtsType = (typeof ATS_TYPES)[number];

// Where the work happens, parsed from the free-text ATS location string.
export const WORKPLACE_TYPES = ["remote", "hybrid", "onsite"] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const WORKPLACE_TYPE_LABELS: Record<WorkplaceType, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

// Engagement type, inferred from title + description keywords.
export const EMPLOYMENT_TYPES = [
  "full-time",
  "part-time",
  "contract",
  "internship",
  "temporary",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

export type OutreachStatus = "none" | "queued" | "sent" | "replied";

// Shared shape both import bridges (CSV + paste-parse) produce. Also the
// structured-output schema for Claude's paste extraction.
export const CandidateJobSchema = z.object({
  company: z.string(),
  title: z.string(),
  url: z.string().optional(),
  location: z.string().optional(),
  roleType: z.enum(ROLE_TYPES).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  description: z.string().optional(),
  // ISO date (YYYY-MM-DD) if the source recorded one, e.g. an applied date.
  date: z.string().optional(),
});
export type CandidateJob = z.infer<typeof CandidateJobSchema>;
