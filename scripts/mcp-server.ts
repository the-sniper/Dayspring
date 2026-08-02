// Dayspring MCP server — drive the whole system by chatting with Claude.
// stdio transport; auto-discovered via the committed .mcp.json.
//
// Deliberate boundary: tools can pull, score, query, and DRAFT — but never
// send outreach and never spend Apollo credits. Approval stays in the UI.
// IMPORTANT: stdout is the JSON-RPC channel — log only via console.error.
export {}; // module scope

async function main() {
  const { prepareCli } = await import("../lib/env");
  await prepareCli();

  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  const { z } = await import("zod");

  const { api, convex } = await import("../lib/convex/server");
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
      const rows = await convex().query(api.jobs.briefList, {
        status: status ?? null,
        roleType: roleType ?? null,
        minScore: minScore ?? null,
        limit: limit ?? 20,
      });
      return text(rows);
    },
  );

  server.registerTool(
    "get_job",
    {
      description:
        "Full detail for one job: description, score, gaps, fit summary, tailored materials, and saved contacts at the company.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const row = await convex().query(api.jobs.getWithCompany, {
        id: id as never,
      });
      if (!row) return text({ error: "job not found" });
      const jobContacts = (
        await convex().query(api.contacts.byCompany, {
          companyId: row.companyId as never,
        })
      ).map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        email: c.email,
        outreachStatus: c.outreachStatus,
      }));
      return text({
        ...row,
        company: row.companyName,
        description: (row.description ?? "").slice(0, 4000),
        contacts: jobContacts,
      });
    },
  );

  server.registerTool(
    "set_job_status",
    {
      description:
        "Move a job through the pipeline (new/ignored/wishlist/applied/screen/interview/offer/rejected). Logs a stage event; first move into applied creates the application record.",
      inputSchema: { id: z.string(), status: z.enum(JOB_STATUSES) },
    },
    async ({ id, status }) => {
      const { setJobStatusCore } = await import("../lib/jobs/transition");
      return text(await setJobStatusCore(id, status));
    },
  );

  server.registerTool(
    "find_contacts",
    {
      description:
        "Search Apollo for people at a tracked company (by company id). Costs zero credits and reveals no emails — pure preview. Saving/enriching happens in the UI.",
      inputSchema: {
        companyId: z.string(),
        titles: z.array(z.string()).optional(),
      },
    },
    async ({ companyId, titles }) => {
      const company = await convex().query(api.companies.getById, {
        id: companyId as never,
      });
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
      inputSchema: { contactId: z.string(), jobId: z.string() },
    },
    async ({ contactId, jobId }) => {
      const { createDraft } = await import("../lib/outreach/core");
      const res = await createDraft(contactId, jobId);
      if (!res.ok) return text(res);
      const row = await convex().query(api.outreach.getById, {
        id: res.outreachId as never,
      });
      return text({
        ...res,
        subject: row?.subject,
        draft: row?.draft,
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
      const rows = (await convex().query(api.outreach.queue, {}))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .map((r) => ({
          id: r.id,
          subject: r.subject,
          sentAt: r.sentAt,
          repliedAt: r.repliedAt,
          followUpDue: r.followUpDue,
          contact: r.contact?.name ?? null,
        }));
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
      return text((await assembleDigest()).text);
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
      if (!await hasHappenstanceKey()) return text({ error: "HAPPENSTANCE_API_KEY not set" });
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
      if (!await hasHappenstanceKey()) return text({ error: "HAPPENSTANCE_API_KEY not set" });
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
        id: z.string(),
        deep: z.boolean().optional(),
      },
    },
    async ({ subjectType, id, deep }) => {
      const { hasApiKey } = await import("../lib/claude/client");
      if (!await hasApiKey()) return text({ error: "ANTHROPIC_API_KEY not set" });
      const { briefForJob, briefForCompany } = await import("../lib/research/core");
      const res =
        subjectType === "job"
          ? await briefForJob(id, deep ?? false)
          : await briefForCompany(id, deep ?? false);
      return text(res);
    },
  );

  server.registerTool(
    "read_codes",
    {
      description:
        "Read recent verification/OTP codes and magic links from your Gmail inbox (last ~20 min). Read-only; never sends or spends.",
    },
    async () => {
      const { hasGmail } = await import("../lib/integrations/gmail/client");
      if (!await hasGmail()) return text({ error: "Gmail not connected" });
      const { findRecentCodes } = await import("../lib/gmail/otp");
      return text(await findRecentCodes({ withinMinutes: 20 }));
    },
  );

  // ── Apply loop ─────────────────────────────────────────────────────────────
  // The apply session lives inside the running Next process (a globalThis
  // singleton owning a real browser), so these tools go over HTTP to it rather
  // than doing anything themselves. They stop at the review gate on purpose:
  // filling a form is delegable, deciding it is ready to send is not, so
  // approve/submit has no tool here and stays a click in the UI.
  const AGENT_URL =
    process.env.DAYSPRING_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  async function agent(op: string, args: Record<string, unknown> = {}) {
    const secret = process.env.DAYSPRING_AGENT_SECRET;
    if (!secret) {
      return {
        error:
          "DAYSPRING_AGENT_SECRET is not set — add it to .env.local (any random string) and restart the app to enable the apply loop.",
      };
    }
    try {
      const res = await fetch(`${AGENT_URL}/api/apply/agent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ op, ...args }),
        signal: AbortSignal.timeout(120_000),
      });
      return await res.json();
    } catch (err) {
      return {
        error: `Couldn't reach Dayspring at ${AGENT_URL} — is \`npm run dev\` running? (${err instanceof Error ? err.message : err})`,
      };
    }
  }

  server.registerTool(
    "apply_open",
    {
      description:
        "Open an attended apply session for a job: launches the Dayspring browser profile, navigates to the application, and runs the normal autofill pass. Stops at the review gate — this can never submit. One session at a time.",
      inputSchema: { jobId: z.string() },
    },
    async ({ jobId }) => text(await agent("open", { jobId })),
  );

  server.registerTool(
    "apply_snapshot",
    {
      description:
        "Look at the open application form: every still-empty visible field (with a ref for apply_fill_field) plus everything currently answered. Take a fresh snapshot after each fill — refs are only valid for the latest one, and re-snapshotting is how you see whether a value actually stuck.",
    },
    async () => text(await agent("snapshot")),
  );

  server.registerTool(
    "apply_fill_field",
    {
      description:
        "Write one value into one field from the latest snapshot. Returns wrote:false when the value didn't take (e.g. no matching dropdown option) — snapshot again and try different wording. Demographic/EEO questions are refused.",
      inputSchema: { ref: z.string(), value: z.string() },
    },
    async ({ ref, value }) => text(await agent("fill", { ref, value })),
  );

  server.registerTool(
    "apply_advance",
    {
      description:
        "Click Next/Continue on a multi-page application and wait for the next page's form. Never matches Submit or Apply. Invalidates the previous snapshot.",
    },
    async () => text(await agent("advance")),
  );

  server.registerTool(
    "apply_state",
    {
      description:
        "Current apply session state: phase, what got filled, what was skipped, and the review summary of what would be submitted.",
    },
    async () => text(await agent("state")),
  );

  server.registerTool(
    "apply_cancel",
    {
      description:
        "Close the apply session and the browser. Nothing is submitted; the job's pipeline status is unchanged.",
    },
    async () => text(await agent("cancel")),
  );

  // ── Email-apply lane ───────────────────────────────────────────────────────
  server.registerTool(
    "draft_application_email",
    {
      description:
        "For postings that say 'email us your resume': draft an application email (subject + body) and resolve which résumé PDF would be attached. Drafting only — this tool cannot send, and the draft is scaffolding you are expected to rewrite.",
      inputSchema: { jobId: z.string(), to: z.string().optional() },
    },
    async ({ jobId, to }) => {
      const { draftApplicationEmail } = await import("../lib/apply/email-apply");
      const res = await draftApplicationEmail(jobId, { to });
      if (!res.ok) return text(res);
      return text({
        ...res,
        note: "Review and send from the app — sending enforces the human-edit floor.",
      });
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
