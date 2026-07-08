// Every table lives in this one file so a later Supabase Postgres port is a
// matter of swapping sqlite-core imports for pg-core. Portability rules:
// integer autoincrement PKs, text for everything stringy (ISO-8601 timestamps
// set in app code, JSON arrays as text-mode json), integer-mode booleans,
// no SQLite-only features.
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  AtsType,
  EmploymentType,
  JobSource,
  JobStatus,
  OutreachStatus,
  RoleType,
  WorkplaceType,
} from "@/lib/types";

export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // App trims/collapses whitespace and looks up via lower(name) before insert.
    name: text("name").notNull(),
    domain: text("domain"),
    roleTypes: text("role_types", { mode: "json" }).$type<RoleType[]>(),
    visaSponsor: integer("visa_sponsor", { mode: "boolean" })
      .notNull()
      .default(false),
    source: text("source"),
    // "Watched" for the feed = both atsType and atsSlug set.
    atsType: text("ats_type").$type<AtsType>(),
    atsSlug: text("ats_slug"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("companies_name_unique").on(t.name)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    title: text("title").notNull(),
    roleType: text("role_type").$type<RoleType>(),
    url: text("url"),
    source: text("source").$type<JobSource>().notNull(),
    // Stable ATS job id; NULL for manual/csv/paste rows.
    externalId: text("external_id"),
    // sha256(companyId|lower(trim(title))|url ?? '') — fallback dedupe for
    // sources without external ids.
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").$type<JobStatus>().notNull().default("new"),
    location: text("location"),
    // Derived, filterable location metadata (see lib/jobs/derive.ts). isUs is
    // nullable: 1 = US, 0 = confirmed non-US, NULL = unknown/remote-no-country.
    isUs: integer("is_us", { mode: "boolean" }),
    workplaceType: text("workplace_type").$type<WorkplaceType>(),
    employmentType: text("employment_type").$type<EmploymentType>(),
    // Annualized USD comp mined from the description; NULL when not stated.
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    description: text("description").notNull().default(""),
    postedAt: text("posted_at"),
    matchScore: integer("match_score"),
    gapNotes: text("gap_notes", { mode: "json" }).$type<string[]>(),
    fitSummary: text("fit_summary"),
    scoredAt: text("scored_at"),
    // Opus-drafted application materials (user-triggered, per job).
    tailoredBullets: text("tailored_bullets", { mode: "json" }).$type<string[]>(),
    coverLetter: text("cover_letter"),
    tailoredAt: text("tailored_at"),
    // Apply-assist lifecycle — orthogonal to the pipeline `status`.
    // null / "in_progress" / "submitted" / "abandoned".
    applyStatus: text("apply_status"),
    applyLog: text("apply_log", { mode: "json" }).$type<string[]>(),
    createdAt: text("created_at").notNull(), // = date_found
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    // NULL externalIds are distinct in both SQLite and Postgres, so manual
    // rows coexist while repeat ATS pulls stay idempotent.
    uniqueIndex("jobs_source_external_id_unique").on(t.source, t.externalId),
    uniqueIndex("jobs_dedupe_key_unique").on(t.dedupeKey),
    index("jobs_status_idx").on(t.status),
    index("jobs_company_id_idx").on(t.companyId),
    index("jobs_is_us_idx").on(t.isUs),
  ],
);

// Submission metadata only — jobs.status is the single source of truth for
// pipeline position. Auto-created on the first transition into `applied`.
export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .unique()
    .references(() => jobs.id),
  resumeVersion: text("resume_version"),
  submittedAt: text("submitted_at"),
  nextAction: text("next_action"),
  nextActionDue: text("next_action_due"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Written on every status change; powers the job-detail timeline and the
// dashboard activity list.
export const stageEvents = sqliteTable(
  "stage_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id),
    fromStatus: text("from_status").$type<JobStatus>(),
    toStatus: text("to_status").$type<JobStatus>().notNull(),
    at: text("at").notNull(),
  },
  (t) => [index("stage_events_job_id_idx").on(t.jobId), index("stage_events_at_idx").on(t.at)],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id").references(() => companies.id),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    linkedin: text("linkedin"),
    // "apollo" | "manual" | "happenstance" | "linkedin"
    source: text("source"),
    // Apollo person id — dedupes repeat saves; NULL for manual contacts.
    apolloId: text("apollo_id"),
    // verified / guessed / unavailable etc. (Apollo's email_status)
    emailStatus: text("email_status"),
    // Happenstance person id — dedupes warm-network saves; NULL otherwise.
    happenstanceId: text("happenstance_id"),
    twitter: text("twitter"),
    // Happenstance "why you know them" summary.
    summary: text("summary"),
    // Mutual-connection names (Happenstance).
    mutuals: text("mutuals", { mode: "json" }).$type<string[]>(),
    // Free text; also holds the LinkedIn "Position @ Company / Connected on" line.
    notes: text("notes"),
    outreachStatus: text("outreach_status")
      .$type<OutreachStatus>()
      .notNull()
      .default("none"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("contacts_apollo_id_unique").on(t.apolloId),
    uniqueIndex("contacts_happenstance_id_unique").on(t.happenstanceId),
  ],
);

export const outreach = sqliteTable("outreach", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id),
  jobId: integer("job_id").references(() => jobs.id),
  channel: text("channel").$type<"email" | "linkedin">(),
  subject: text("subject"),
  draft: text("draft"),
  sentAt: text("sent_at"),
  repliedAt: text("replied_at"),
  // The follow-up engine's cursor (YYYY-MM-DD).
  followUpDue: text("follow_up_due"),
  // Set on Gmail send; getThread(gmailThreadId) powers reply detection, and
  // nudges send into the same thread.
  gmailThreadId: text("gmail_thread_id"),
  gmailMessageId: text("gmail_message_id"),
  createdAt: text("created_at").notNull(),
});

// Claude web_search research briefs. Exactly one of jobId/companyId is set
// (a job brief also carries its companyId so outreach can reuse it). A
// "Regenerate" inserts a new row — latest-by-createdAt wins, history kept.
export const researchBriefs = sqliteTable(
  "research_briefs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id").references(() => jobs.id),
    companyId: integer("company_id").references(() => companies.id),
    kind: text("kind").notNull(), // "job" | "company"
    brief: text("brief").notNull(), // markdown prose from the web_search call
    sources: text("sources", { mode: "json" }).$type<
      { title: string; url: string }[]
    >(),
    model: text("model"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("research_briefs_job_id_idx").on(t.jobId),
    index("research_briefs_company_id_idx").on(t.companyId),
  ],
);

// Job-site accounts created during apply-assist. Passwords are AES-256-GCM
// encrypted at rest (lib/vault/crypto.ts); the key never leaves .env.local.
export const siteCredentials = sqliteTable(
  "site_credentials",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    site: text("site").notNull(), // human label, e.g. "Workday — Nvidia"
    host: text("host").notNull(), // e.g. "nvidia.wd5.myworkdayjobs.com"
    username: text("username").notNull(), // email used to register
    passwordEnc: text("password_enc").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("site_credentials_host_username_unique").on(t.host, t.username)],
);

// Key-value store; row key='profile' holds the resume/preferences text.
// Also: gmailRefreshToken, gmailEmail, lastDailyRun, resumePath (M19),
// masterPasswordEnc (M18, JSON {iv,authTag,cipherText}), tos:<host> (M20).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
