import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Convex port of the former SQLite/Drizzle schema. Field names match the app's
// camelCase property names (not the old snake_case columns). Nullable columns
// become v.optional(...) (absent when unset); timestamps stay ISO-8601 strings
// so existing slice/compare logic keeps working. Integer PKs are replaced by
// Convex string _id; FK columns are v.id("<table>").
//
// MULTI-USER: every app table carries `userId` and every function scopes reads
// and writes to the signed-in user (see getAuthUserId in each module). The
// field is optional only so pre-auth rows still validate — new rows always set
// it, and user-scoped index reads never return legacy rows without it.
export default defineSchema({
  ...authTables,

  companies: defineTable({
    userId: v.optional(v.id("users")),
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
    // Applicant-competition proxy. headcount comes from Apollo organization
    // enrichment (1 credit each); enrichedAt lets the backfill skip companies
    // already done so a re-run costs nothing. Absent = unknown, and unknown is
    // never silently filtered out of the feed.
    headcount: v.optional(v.number()),
    foundedYear: v.optional(v.number()),
    enrichedAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"]),

  jobs: defineTable({
    userId: v.optional(v.id("users")),
    companyId: v.id("companies"),
    title: v.string(),
    roleType: v.optional(v.string()),
    // Seniority band parsed from the title (shared/seniority.ts). Absent on
    // rows pulled before the field existed — backfillLevels fills those in.
    level: v.optional(v.string()),
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
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_dedupe", ["userId", "dedupeKey"])
    .index("by_user_source_external", ["userId", "source", "externalId"])
    .index("by_company", ["companyId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["userId", "status", "isUs"],
    }),

  // 1:1 with jobs — the big JD text, split off so job-row scans stay small.
  // Ownership derives from the parent job; every access goes through a job
  // the caller already owns.
  jobDescriptions: defineTable({
    jobId: v.id("jobs"),
    text: v.string(),
  }).index("by_job", ["jobId"]),

  // Second discovery source: LinkedIn posts where someone announces an open
  // role. Fetched through a third-party scraping API, then AI-extracted into
  // company / titles / apply link. Post bodies are capped at POST_TEXT_LIMIT
  // (shared/linkedin-posts.ts) so they stay small enough to live on the row —
  // unlike JDs, which need the jobDescriptions side table.
  //
  // status: new | saved | done | ignored. Posts the extractor judged non-hiring
  // are stored as `ignored` rather than dropped. `done` is a user "I've handled
  // this" archive. Pull dedupes on externalId for every status, so archived
  // posts never reappear on the untriaged feed.
  linkedinPosts: defineTable({
    userId: v.optional(v.id("users")),
    // Provider post id / URN — the dedupe key across pulls.
    externalId: v.string(),
    postUrl: v.string(),
    authorName: v.string(),
    authorHeadline: v.optional(v.string()),
    authorProfileUrl: v.optional(v.string()),
    text: v.string(),
    postedAt: v.optional(v.string()),
    reactions: v.optional(v.number()),
    // Which search term surfaced this post.
    query: v.optional(v.string()),
    companyName: v.optional(v.string()),
    roleTitles: v.optional(v.array(v.string())),
    location: v.optional(v.string()),
    // Set only when a real link was present in the post text — never a model
    // guess (see lib/linkedin/extract.ts).
    jobUrl: v.optional(v.string()),
    extractedAt: v.optional(v.string()),
    status: v.string(),
    // Set once the post has been promoted into the pipeline as a job row.
    jobId: v.optional(v.id("jobs")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_external", ["userId", "externalId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["userId", "status"],
    }),

  applications: defineTable({
    userId: v.optional(v.id("users")),
    jobId: v.id("jobs"),
    resumeVersion: v.optional(v.string()),
    submittedAt: v.optional(v.string()),
    nextAction: v.optional(v.string()),
    nextActionDue: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_job", ["jobId"])
    .index("by_user", ["userId"]),

  stageEvents: defineTable({
    userId: v.optional(v.id("users")),
    jobId: v.id("jobs"),
    fromStatus: v.optional(v.string()),
    toStatus: v.string(),
    at: v.string(),
  })
    .index("by_job", ["jobId"])
    .index("by_user_at", ["userId", "at"]),

  contacts: defineTable({
    userId: v.optional(v.id("users")),
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
    .index("by_user", ["userId"])
    .index("by_company", ["companyId"])
    .index("by_user_apollo", ["userId", "apolloId"])
    .index("by_user_happenstance", ["userId", "happenstanceId"]),

  outreach: defineTable({
    userId: v.optional(v.id("users")),
    contactId: v.id("contacts"),
    jobId: v.optional(v.id("jobs")),
    channel: v.optional(v.string()),
    subject: v.optional(v.string()),
    draft: v.optional(v.string()),
    // The untouched AI proposal, frozen at draft time. humanEditedPct is the
    // edit distance between this and what actually went out, as a % of the
    // final body — the floor gate reads it, and the metrics segment by it.
    // Absent on pre-ledger rows; the floor only applies when it exists.
    aiDraft: v.optional(v.string()),
    humanEditedPct: v.optional(v.number()),
    // Touch model: touchNumber 1–3 within a thread, parentId links a follow-up
    // to the touch before it. Absent = legacy row = touch 1. The 3-touch cap
    // is enforced in lib/outreach/core.ts, not here.
    touchNumber: v.optional(v.number()),
    parentId: v.optional(v.id("outreach")),
    // Per-channel plus-alias the send went out under (attribution).
    aliasUsed: v.optional(v.string()),
    // no_reply | reply_no | reply_yes | call_booked | interview | offer
    outcome: v.optional(v.string()),
    sentAt: v.optional(v.string()),
    repliedAt: v.optional(v.string()),
    followUpDue: v.optional(v.string()),
    gmailThreadId: v.optional(v.string()),
    gmailMessageId: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_contact", ["contactId"])
    .index("by_job", ["jobId"]),

  // The reply trigger, one row per verified overlap with a contact. The
  // outreach research is unambiguous that shared affiliation is what earns
  // replies, so drafts cite these and the composer warns when a contact has
  // none. strength 1–3; an OSS overlap you created (merged PR in their repo)
  // outranks a shared alma mater because it also proves competence.
  affiliations: defineTable({
    userId: v.optional(v.id("users")),
    contactId: v.id("contacts"),
    // alma_mater | ex_employer | oss_repo | mutual | conference | content
    kind: v.string(),
    detail: v.string(),
    strength: v.number(),
    evidenceUrl: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_contact", ["contactId"]),

  researchBriefs: defineTable({
    userId: v.optional(v.id("users")),
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
    userId: v.optional(v.id("users")),
    site: v.string(),
    host: v.string(),
    username: v.string(),
    passwordEnc: v.string(),
    iv: v.string(),
    authTag: v.string(),
    createdAt: v.string(),
    lastUsedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_host", ["userId", "host"]),

  masterResumes: defineTable({
    userId: v.optional(v.id("users")),
    label: v.string(),
    content: v.string(),
    // Legacy local-disk path (pre-hosting); new uploads store the original PDF
    // in Convex File Storage via sourceFileId.
    sourceFile: v.optional(v.string()),
    sourceFileId: v.optional(v.id("_storage")),
    isPrimary: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  }).index("by_user", ["userId"]),

  generatedResumes: defineTable({
    userId: v.optional(v.id("users")),
    jobId: v.id("jobs"),
    content: v.string(),
    // Legacy local-disk path (pre-hosting); new renders store the PDF in
    // Convex File Storage (pdfFileId) with fileName for Content-Disposition.
    pdfPath: v.optional(v.string()),
    pdfFileId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    style: v.optional(v.string()),
    audit: v.optional(v.string()),
    tailoringNote: v.optional(v.string()),
    model: v.optional(v.string()),
    createdAt: v.string(),
  }).index("by_job", ["jobId"]),

  profiles: defineTable({
    userId: v.optional(v.id("users")),
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
  }).index("by_user", ["userId"]),

  // Auto-apply bucket: jobs the user queued for assisted batch applying.
  // masterResumeId absent = "auto" (per-job tailored PDF → primary master).
  // status: queued | applying | submitted | manual | skipped | failed.
  applyQueue: defineTable({
    userId: v.optional(v.id("users")),
    jobId: v.id("jobs"),
    masterResumeId: v.optional(v.id("masterResumes")),
    status: v.string(),
    note: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_job", ["userId", "jobId"]),

  // Screening-question answer bank (the Jobright/Simplify "answer memory"):
  // answers captured at apply-approval time, reused on future applications.
  // key = normalized question text; question = raw label for display.
  applyAnswers: defineTable({
    userId: v.optional(v.id("users")),
    key: v.string(),
    question: v.string(),
    answer: v.string(),
    updatedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_key", ["userId", "key"]),

  // Key-value settings (profile blob, Gmail tokens, sealed API keys, ToS acks,
  // lastDailyRun) — per user. Sensitive values are AES-256-GCM sealed by their
  // callers (lib/keys.ts, lib/vault) BEFORE landing here — Convex only ever
  // stores opaque ciphertext for those rows; DAYSPRING_VAULT_KEY stays in env.
  settings: defineTable({
    userId: v.optional(v.id("users")),
    key: v.string(),
    value: v.string(),
    updatedAt: v.string(),
  }).index("by_user_key", ["userId", "key"]),
});
