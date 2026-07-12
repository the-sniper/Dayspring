import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Convex port of the former SQLite/Drizzle schema. Field names match the app's
// camelCase property names (not the old snake_case columns). Nullable columns
// become v.optional(...) (absent when unset); timestamps stay ISO-8601 strings
// so existing slice/compare logic keeps working. Integer PKs are replaced by
// Convex string _id; FK columns are v.id("<table>").
export default defineSchema({
  companies: defineTable({
    name: v.string(),
    domain: v.optional(v.string()),
    roleTypes: v.optional(v.array(v.string())),
    visaSponsor: v.boolean(),
    source: v.optional(v.string()),
    atsType: v.optional(v.string()),
    atsSlug: v.optional(v.string()),
    atsTenant: v.optional(v.string()),
    atsHost: v.optional(v.string()),
    atsSite: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_name", ["name"]),

  jobs: defineTable({
    companyId: v.id("companies"),
    title: v.string(),
    roleType: v.optional(v.string()),
    url: v.optional(v.string()),
    source: v.string(),
    externalId: v.optional(v.string()),
    dedupeKey: v.string(),
    status: v.string(),
    location: v.optional(v.string()),
    isUs: v.optional(v.boolean()),
    workplaceType: v.optional(v.string()),
    employmentType: v.optional(v.string()),
    salaryMin: v.optional(v.number()),
    salaryMax: v.optional(v.number()),
    salaryCurrency: v.optional(v.string()),
    // The (large) JD text lives in the `jobDescriptions` side table so that
    // whole-table scans (feed, dashboard, scoring) stay under Convex's 16 MiB
    // per-query read limit. `jdChars` is the cached length so length checks
    // ("is this JD long enough to score?") never need to read the text.
    // `description` is retained (optional) only so pre–side-table rows still
    // validate; new rows omit it and readers use the side table.
    description: v.optional(v.string()),
    jdChars: v.optional(v.number()),
    postedAt: v.optional(v.string()),
    matchScore: v.optional(v.number()),
    gapNotes: v.optional(v.array(v.string())),
    fitSummary: v.optional(v.string()),
    scoredAt: v.optional(v.string()),
    tailoredBullets: v.optional(v.array(v.string())),
    coverLetter: v.optional(v.string()),
    tailoredAt: v.optional(v.string()),
    applyStatus: v.optional(v.string()),
    applyLog: v.optional(v.array(v.string())),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_company", ["companyId"])
    .index("by_is_us", ["isUs"])
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_source_external_id", ["source", "externalId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["status", "isUs"],
    }),

  // 1:1 with jobs — the big JD text, split off so job-row scans stay small.
  jobDescriptions: defineTable({
    jobId: v.id("jobs"),
    text: v.string(),
  }).index("by_job", ["jobId"]),

  applications: defineTable({
    jobId: v.id("jobs"),
    resumeVersion: v.optional(v.string()),
    submittedAt: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    nextActionDue: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_job", ["jobId"]),

  stageEvents: defineTable({
    jobId: v.id("jobs"),
    fromStatus: v.optional(v.string()),
    toStatus: v.string(),
    at: v.string(),
  })
    .index("by_job", ["jobId"])
    .index("by_at", ["at"]),

  contacts: defineTable({
    companyId: v.optional(v.id("companies")),
    name: v.string(),
    title: v.optional(v.string()),
    email: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    source: v.optional(v.string()),
    apolloId: v.optional(v.string()),
    emailStatus: v.optional(v.string()),
    happenstanceId: v.optional(v.string()),
    twitter: v.optional(v.string()),
    summary: v.optional(v.string()),
    mutuals: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    outreachStatus: v.string(),
    createdAt: v.string(),
  })
    .index("by_company", ["companyId"])
    .index("by_apollo_id", ["apolloId"])
    .index("by_happenstance_id", ["happenstanceId"]),

  outreach: defineTable({
    contactId: v.id("contacts"),
    jobId: v.optional(v.id("jobs")),
    channel: v.optional(v.string()),
    subject: v.optional(v.string()),
    draft: v.optional(v.string()),
    sentAt: v.optional(v.string()),
    repliedAt: v.optional(v.string()),
    followUpDue: v.optional(v.string()),
    gmailThreadId: v.optional(v.string()),
    gmailMessageId: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_contact", ["contactId"])
    .index("by_job", ["jobId"]),

  researchBriefs: defineTable({
    jobId: v.optional(v.id("jobs")),
    companyId: v.optional(v.id("companies")),
    kind: v.string(),
    brief: v.string(),
    sources: v.optional(
      v.array(v.object({ title: v.string(), url: v.string() })),
    ),
    model: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_job", ["jobId"])
    .index("by_company", ["companyId"]),

  siteCredentials: defineTable({
    site: v.string(),
    host: v.string(),
    username: v.string(),
    passwordEnc: v.string(),
    iv: v.string(),
    authTag: v.string(),
    createdAt: v.string(),
    lastUsedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_host_username", ["host", "username"]),

  masterResumes: defineTable({
    label: v.string(),
    content: v.string(),
    sourceFile: v.optional(v.string()),
    isPrimary: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }),

  generatedResumes: defineTable({
    jobId: v.id("jobs"),
    content: v.string(),
    pdfPath: v.optional(v.string()),
    style: v.optional(v.string()),
    audit: v.optional(v.string()),
    tailoringNote: v.optional(v.string()),
    model: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_job", ["jobId"]),

  profiles: defineTable({
    name: v.string(),
    isDefault: v.boolean(),
    fullName: v.optional(v.string()),
    headline: v.optional(v.string()),
    summary: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    github: v.optional(v.string()),
    website: v.optional(v.string()),
    content: v.string(),
    doc: v.optional(v.any()),
    defaults: v.optional(v.any()),
    createdAt: v.string(),
    updatedAt: v.string(),
  }),
  // NOTE: the key-value `settings` store lives locally (lib/settings/store.ts),
  // not in Convex, so machine-local secrets (API keys, vault master password,
  // Gmail tokens) never leave the machine.
});
