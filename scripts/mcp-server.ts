// Dayspring MCP server — drive the whole system by chatting with Claude.
// stdio transport; auto-discovered via the committed .mcp.json.
//
// Deliberate boundary: tools can pull, score, query, and DRAFT — but never
// send outreach and never spend Apollo credits. Approval stays in the UI.
// IMPORTANT: stdout is the JSON-RPC channel — log only via console.error.
export {}; // module scope

async function main() {
  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();

  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const { z } = await import("zod");

  const { db } = await import("../lib/db");
  const { companies, contacts, jobs, outreach } = await import("../lib/db/schema");
  const { and, desc, eq, gte, sql } = await import("drizzle-orm");
  const { JOB_STATUSES, ROLE_TYPES } = await import("../lib/types");

  const server = new McpServer({ name: "dayspring", version: "1.0.0" });

  const text = (value: unknown) => ({
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  });

  server.registerTool(
    "pull_jobs",
    {
      description:
        "Pull fresh postings from all watched company ATS boards (Greenhouse/Lever/Ashby). Dedupes automatically; returns per-company added counts.",
    },
    async () => {
      const { pullAllJobs } = await import("../lib/jobs/pull");
      return text(await pullAllJobs());
    },
  );

  server.registerTool(
    "score_unscored",
    {
      description:
        "Score up to 25 unscored new/wishlist jobs against the profile (Claude Sonnet, ~$0.02/job). Returns scored/failed/remaining counts.",
    },
    async () => {
      const { scoreUnscored } = await import("../lib/jobs/score");
      return text(await scoreUnscored(25));
    },
  );

  server.registerTool(
    "list_jobs",
    {
      description:
        "List tracked jobs, filterable by status, role type, and minimum match score. Compact rows: id, title, company, status, score.",
      inputSchema: {
        status: z.enum(JOB_STATUSES).optional(),
        roleType: z.enum(ROLE_TYPES).optional(),
        minScore: z.number().optional(),
        limit: z.number().optional(),
      },
    },
    async ({ status, roleType, minScore, limit }) => {
      const rows = db
        .select({
          id: jobs.id,
          title: jobs.title,
          company: companies.name,
          status: jobs.status,
          roleType: jobs.roleType,
          score: jobs.matchScore,
          location: jobs.location,
        })
        .from(jobs)
        .innerJoin(companies, eq(jobs.companyId, companies.id))
        .where(
          and(
            status ? eq(jobs.status, status) : undefined,
            roleType ? eq(jobs.roleType, roleType) : undefined,
            minScore !== undefined ? gte(jobs.matchScore, minScore) : undefined,
          ),
        )
        .orderBy(sql`${jobs.matchScore} is null`, desc(jobs.matchScore))
        .limit(Math.min(limit ?? 20, 100))
        .all();
      return text(rows);
    },
  );

  server.registerTool(
    "get_job",
    {
      description:
        "Full detail for one job: description, score, gaps, fit summary, tailored materials, and saved contacts at the company.",
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      const row = db
        .select({ job: jobs, company: companies.name, companyId: companies.id })
        .from(jobs)
        .innerJoin(companies, eq(jobs.companyId, companies.id))
        .where(eq(jobs.id, id))
        .get();
      if (!row) return text({ error: "job not found" });
      const jobContacts = db
        .select({
          id: contacts.id,
          name: contacts.name,
          title: contacts.title,
          email: contacts.email,
          outreachStatus: contacts.outreachStatus,
        })
        .from(contacts)
        .where(eq(contacts.companyId, row.companyId))
        .all();
      return text({
        ...row.job,
        company: row.company,
        description: row.job.description.slice(0, 4000),
        contacts: jobContacts,
      });
    },
  );

  server.registerTool(
    "set_job_status",
    {
      description:
        "Move a job through the pipeline (new/ignored/wishlist/applied/screen/interview/offer/rejected). Logs a stage event; first move into applied creates the application record.",
      inputSchema: { id: z.number(), status: z.enum(JOB_STATUSES) },
    },
    async ({ id, status }) => {
      const { setJobStatusCore } = await import("../lib/jobs/transition");
      return text(setJobStatusCore(id, status));
    },
  );

  server.registerTool(
    "find_contacts",
    {
      description:
        "Search Apollo for people at a tracked company (by company id). Costs zero credits and reveals no emails — pure preview. Saving/enriching happens in the UI.",
      inputSchema: {
        companyId: z.number(),
        titles: z.array(z.string()).optional(),
      },
    },
    async ({ companyId, titles }) => {
      const company = db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .get();
      if (!company) return text({ error: "company not found" });
      if (!company.domain) return text({ error: "company has no domain set" });
      const { searchPeople } = await import("../lib/integrations/apollo/search");
      return text(
        await searchPeople({
          domain: company.domain,
          titles: titles?.length
            ? titles
            : ["technical recruiter", "engineering manager"],
        }),
      );
    },
  );

  server.registerTool(
    "draft_outreach",
    {
      description:
        "Draft a warm outreach email (Claude Opus) from a saved contact id + job id. The draft lands in the Outreach queue for human review — this tool cannot send.",
      inputSchema: { contactId: z.number(), jobId: z.number() },
    },
    async ({ contactId, jobId }) => {
      const { createDraft } = await import("../lib/outreach/core");
      const res = await createDraft(contactId, jobId);
      if (!res.ok) return text(res);
      const row = db
        .select({ subject: outreach.subject, draft: outreach.draft })
        .from(outreach)
        .where(eq(outreach.id, res.outreachId))
        .get();
      return text({
        ...res,
        ...row,
        note: "Draft saved — review and send from http://localhost:3000/outreach",
      });
    },
  );

  server.registerTool(
    "outreach_queue",
    {
      description:
        "Current outreach state: drafts awaiting approval, sent awaiting reply (with follow-up due dates), and replied.",
    },
    async () => {
      const rows = db
        .select({
          id: outreach.id,
          subject: outreach.subject,
          sentAt: outreach.sentAt,
          repliedAt: outreach.repliedAt,
          followUpDue: outreach.followUpDue,
          contact: contacts.name,
        })
        .from(outreach)
        .innerJoin(contacts, eq(outreach.contactId, contacts.id))
        .orderBy(desc(outreach.createdAt))
        .all();
      return text({
        drafts: rows.filter((r) => !r.sentAt),
        awaitingReply: rows.filter((r) => r.sentAt && !r.repliedAt),
        replied: rows.filter((r) => r.repliedAt),
      });
    },
  );

  server.registerTool(
    "check_replies",
    {
      description:
        "Scan Gmail threads of sent outreach for replies; marks replied rows. Needs Gmail connected.",
    },
    async () => {
      const { checkReplies } = await import("../lib/outreach/replies");
      return text(await checkReplies());
    },
  );

  server.registerTool(
    "digest",
    {
      description:
        "Assemble the morning digest (high-fit new roles, follow-ups due, next actions, funnel) as text — without emailing it.",
    },
    async () => {
      const { assembleDigest } = await import("../lib/digest");
      return text(assembleDigest().text);
    },
  );

  // Warm-network search — the ONE deliberate exception to "MCP spends nothing":
  // Happenstance has no free preview tier, so search itself costs credits.
  // Loudly labeled so the human opts in per call.
  server.registerTool(
    "happenstance_search",
    {
      description:
        "Search your OWN network (Happenstance) in natural language for warm intros. COSTS 2 HAPPENSTANCE CREDITS per call. Returns people you already know; saving to contacts happens in the UI.",
      inputSchema: { text: z.string() },
    },
    async ({ text: query }) => {
      const { hasHappenstanceKey } = await import(
        "../lib/integrations/happenstance/client"
      );
      if (!hasHappenstanceKey()) return text({ error: "HAPPENSTANCE_API_KEY not set" });
      const { searchNetwork } = await import(
        "../lib/integrations/happenstance/search"
      );
      return text(await searchNetwork({ text: query }));
    },
  );

  server.registerTool(
    "happenstance_research",
    {
      description:
        "Compile a deep profile for one person via Happenstance. COSTS 1 HAPPENSTANCE CREDIT. Pass a description (name + company/title/location to disambiguate).",
      inputSchema: { description: z.string() },
    },
    async ({ description }) => {
      const { hasHappenstanceKey } = await import(
        "../lib/integrations/happenstance/client"
      );
      if (!hasHappenstanceKey()) return text({ error: "HAPPENSTANCE_API_KEY not set" });
      const { researchPerson } = await import(
        "../lib/integrations/happenstance/research"
      );
      return text(await researchPerson({ description }));
    },
  );

  server.registerTool(
    "research_brief",
    {
      description:
        "Generate a cited web-research brief on a job or company (funding, news, tech, interview intel). Uses Claude web search — costs Anthropic tokens only. Stored and reused by tailoring + outreach.",
      inputSchema: {
        subjectType: z.enum(["job", "company"]),
        id: z.number(),
        deep: z.boolean().optional(),
      },
    },
    async ({ subjectType, id, deep }) => {
      const { hasApiKey } = await import("../lib/claude/client");
      if (!hasApiKey()) return text({ error: "ANTHROPIC_API_KEY not set" });
      const { briefForJob, briefForCompany } = await import("../lib/research/core");
      const res =
        subjectType === "job"
          ? await briefForJob(id, deep ?? false)
          : await briefForCompany(id, deep ?? false);
      return text(res);
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("dayspring mcp server ready (stdio)");
}

main().catch((err) => {
  console.error("mcp server failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
