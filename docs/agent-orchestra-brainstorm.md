# Dayspring Agent Orchestra — Brainstorm & Architecture

*A company of agents: org design, accountability machinery, and architecture decisions. Research-backed, nothing built yet.*

---

## 0. TL;DR — the design thesis

Build a **company-shaped interface on top of a shallow, orchestrator-centric architecture**. The org chart you present to yourself (CEO → team leads → employees) is the *product surface*; underneath, the safest proven topology is **one strong orchestrator, one level of specialist workers, and an independent verification layer** — not a deep management tree. The research is unusually consistent on this:

- Anthropic's production multi-agent research system (orchestrator + parallel subagents) beat a single agent by **90.2%** on research tasks — but costs **~15× the tokens** of a chat.
- Deep chains destroy accuracy: in MIT-cited experiments, a model at **90.7% accuracy alone dropped to 41.2% after two delegation stages and 22.5% after five** when no new information entered at each stage.
- Google's 2026 scaling study (180 configurations): centralized orchestration contained error amplification to **4.4×**; free-running independent agents amplified errors **17.2×**.
- Cognition's counterpoint ("Don't Build Multi-Agents"): parallel agents that can't see each other's decisions make **conflicting implicit decisions**. Parallelism is safe for *reading* (research), dangerous for *writing* (code, content) — final synthesis should always be one agent.

So: **hierarchy for accountability and reporting, not for information flow.** Every layer a fact passes through is a chance to hallucinate; every artifact handoff is a chance to verify. Design accordingly.

What makes it *incredibly powerful* is not agent count — it's four things most people skip:

1. **Task contracts** — every delegation is a written brief with objective, output format, tool budget, boundaries, and definition-of-done. (Anthropic found vague briefs → duplicated work and runaway subagents.)
2. **Independent verification** — a QA agent that did *not* do the work checks it. Agents grade their own work too generously; planner/executor/verifier splits consistently beat self-evaluation.
3. **Durable, inspectable state** — every task, artifact, decision, and report lives in Convex tables you can open like a dashboard. The company has a paper trail.
4. **Human on the trigger** — Dayspring's existing philosophy, which turns out to be exactly what separates the surviving 30% of GTM-agent deployments from the 70% that got cancelled: AI researches, decides, drafts, queues; **you approve anything that leaves the building** (posts, emails, deploys).

---

## 1. What the internet says: works vs. fails

### Patterns that survived to 2026 production

| Pattern | Evidence |
|---|---|
| **Orchestrator–worker (hub-and-spoke)** | Dominant surviving topology (Anthropic Research, Exa, S&P Kensho). Lead agent plans and synthesizes; workers do bounded, parallel *read* work. |
| **Sequential pipeline with artifact gates** | Stageable work with clear intermediate artifacts (research → strategy → draft → review → approve). |
| **Planner / executor / verifier separation** | Self-evaluation fails ("agents grade their own work too generously" — Addy Osmani's harness-engineering writeup). |
| **Bounded collaboration only** | Peer-to-peer agent "discussion" survived *only* with phase gates, artifact constraints, or a supervisor. Open mesh failed everywhere. |
| **Detailed delegation briefs** | Anthropic: "research the semiconductor shortage" → duplicate work; explicit objective + format + tool guidance + boundaries fixed it. Embed scaling rules (simple task = 1 agent, 3–10 tool calls). |
| **Hybrid human/AI GTM** | The surviving AI-SDR model: AI owns research, enrichment, sequencing, follow-up scheduling; humans own the send decision and relationships. 2–3× throughput per human, ~$15–20/meeting vs $150–300 for full-auto after deliverability collapse. |

### Recurring failure modes (design against every one)

1. **Compounding hallucination through layers** — each summarize-and-pass-up step loses grounding. *Countermeasure: artifacts carry citations to raw sources; verifier checks claims against sources, not against the summary.*
2. **Agents lying about completion** — "done" without evidence. *Countermeasure: definition-of-done is machine-checkable where possible; verifier signs off, not the doer.*
3. **Conflicting implicit decisions in parallel writes** (Cognition's Flappy Bird example). *Countermeasure: one writer per deliverable; parallelism only for research.*
4. **Runaway spawning & cost blowups** — early Anthropic agents spawned 50 subagents for trivial queries; multi-agent ≈ 15× chat tokens. *Countermeasure: per-task token/tool/time budgets, spawn caps, and a cost ledger.*
5. **Context fragmentation** — subagents ignorant of each other's work. *Countermeasure: shared task board + memory files; pass full relevant traces, not one-line summaries, on interdependent work.*
6. **Fragile long runs** — one bad tool call kills an hour of work. *Countermeasure: durable execution with checkpoint/resume (this is exactly what Convex workflows give you for free).*
7. **GTM-specific: hallucinated personalization** — 12–18% of AI-generated outreach emails contained at least one false company-specific claim; one fabricated "congrats on your fundraise" went viral and killed contracts in 48h. *Countermeasure: every personalization claim must cite a fetched source; no source, no claim.*
8. **Deliverability collapse** — volume ramps trip Gmail/Yahoo bulk-sender thresholds (spam complaints must stay <0.3%); inbox placement falls off a cliff by week 3–4. *Countermeasure: human-volume sending caps, warmup, no autonomous sending.*

---

## 2. Foundational architecture: loop vs. graph vs. harness

You asked directly — the answer is **all three, at different layers**. This is the "latest" consensus architecture (2026): *durable graph for the company, agent loop inside each employee, harness engineering around everything.*

### Layer 1 — The company is a **durable graph** (deterministic orchestration)

The org's workflows — "produce this week's LinkedIn content," "triage the job feed," "run outreach research" — are **explicit, deterministic pipelines with checkpoints**, not free-form agent conversation. Nodes are agent tasks; edges are artifact handoffs; gates are verifications and human approvals.

- Why: deterministic replay, resume-from-checkpoint, auditability, cost containment. This is LangGraph's core insight — but **you already have a durable execution engine: Convex**. `@convex-dev/workflow` + `@convex-dev/agent` (and `@convex-dev/workpool` for parallelism control) give you durable, restart-surviving, retry-capable agent workflows *inside the backend you already run*. Your CLAUDE.md's `convex ai-files install` even ships agent skills for this.
- The graph is *shallow*: Orchestrator → workers → verifier → human gate. No manager-of-manager-of-worker chains (see the 41.2%→22.5% decay above).

### Layer 2 — Each employee is an **agent loop** (ReAct-style)

Inside a node, the employee runs the classic loop — reason → act (tool call) → observe → repeat — until its definition-of-done is met or its budget runs out. Claude Agent SDK subagents, or `@convex-dev/agent` threads with tools, both model this. The loop is where model intelligence lives; keep it on a leash:

- Hard budgets per task: max tool calls, max tokens, max wall-clock.
- Extended thinking as a visible scratchpad (improves plan quality; you can audit reasoning).
- Structured output contracts (zod schemas — already in your stack) so handoffs are typed, not prose.

### Layer 3 — **Harness engineering** is where the reliability actually comes from

The 2026 lesson (Osmani, Anthropic, everyone shipping): the model is one component; *the scaffolding is the product*. Concretely for the orchestra:

- **Filesystem/DB as memory**: role charters, brand-voice guide, ICP definitions, past decisions in versioned files/tables; reloaded each run. Keep each charter tight — every rule should trace to a real past failure, not brainstormed hypotheticals.
- **Hooks/gates at lifecycle points**: pre-tool-call permission checks (an agent that can *draft* email must not hold a tool that can *send* email — capability separation beats prompt-level "please don't send"), post-task verification, pre-"external action" human approval.
- **"Success is silent, failures are verbose"**: pass results flow through; failures inject full error text back into the loop.
- **Fail-once-fix-forever**: when an agent screws up, the fix goes into its charter/harness so that class of failure can't recur.
- **Observability**: every agent turn logged (task id, tokens, tool calls, outcome) to a Convex table → your dashboard *is* the company's HR/ops system.

### Framework choice

| Option | Verdict for you |
|---|---|
| **Claude Agent SDK (TS)** | Best-in-class loops, subagents, hooks, MCP; but processes are ephemeral — you'd bolt on your own durability. Great for the *dev team* agents that touch the repo. |
| **Convex `@convex-dev/agent` + `workflow`** | **Recommended core.** Durable, checkpointed, retries, workpool parallelism, lives in your existing backend, UI-inspectable state for free. |
| **LangGraph** | The reference for durable graphs + LangSmith observability; but Python-first and a second backend you don't need — Convex covers the same ground in your stack. |
| **CrewAI** | Fast role-play prototyping; ~3× token overhead, non-deterministic, weak observability. Skip. |
| **AutoGen/AG2** | Maintenance mode. Skip. |

**Model mix** (mirrors Anthropic's production setup and your existing lib/claude tiering): Opus-class for the Orchestrator and Verifier, Sonnet-class for team leads/specialists, Haiku-class for classification/formatting grunt work.

---

## 3. The org chart

```
                                YOU (CEO / final approver)
                                        │
                        ┌───────────────┴───────────────┐
                        │   ATLAS — Chief of Staff       │   ← the only agent that talks to you
                        │   (orchestrator)               │
                        └───┬───────────┬───────────┬───┘
            ┌───────────────┘           │           └───────────────┐
   ┌────────┴────────┐        ┌────────┴────────┐        ┌────────┴────────┐
   │ PRODUCT & ENG   │        │ GTM & SOCIALS   │        │ OPS & QUALITY   │
   │ team            │        │ team            │        │ (independent)    │
   ├─────────────────┤        ├─────────────────┤        ├─────────────────┤
   │ Forge  (lead)   │        │ Compass (lead)  │        │ Sentinel (QA/   │
   │ Scout  (research)│       │ Radar  (market  │        │   verifier)     │
   │ Mason  (builder)│        │   research)     │        │ Ledger (cost &  │
   │ Probe  (test/   │        │ Quill  (content)│        │   budget)       │
   │   review)       │        │ Herald (outreach│        │ Archive         │
   └─────────────────┘        │   research)     │        │   (librarian/   │
                              │ Pulse  (analytics)│      │   memory)       │
                              └─────────────────┘        └─────────────────┘
```

Two levels of delegation, never more. Team "leads" are planning/synthesis roles, not extra hops for facts — specialists' artifacts (with citations) remain visible to the Orchestrator and Verifier. **One writer per deliverable; parallelism for research only.**

### Executive

**ATLAS — Chief of Staff / Orchestrator** *(Opus-tier)*
- Sole interface to you: takes your goals, decomposes into task contracts, assigns to team leads, tracks the board, compiles the daily brief.
- Owns prioritization and scaling rules (trivial task → single agent, few tool calls; complex → fan out).
- Never does object-level work itself; never summarizes away citations — forwards artifacts.
- Escalates to you: any external action, any budget breach, any unresolved verification failure, any two-strike task.

### Product & Engineering team (works on the Dayspring codebase)

**Forge — Tech Lead** *(Sonnet/Opus)*: turns feature goals into specs and task breakdowns; reviews Mason's diffs against spec; owns "how it fits the architecture." Definition-of-done: spec with acceptance criteria.
**Scout — Research Engineer** *(Sonnet)*: reads code/docs/APIs, produces cited technical briefs ("how do we integrate X"). Read-only; no write tools.
**Mason — Builder** *(Sonnet)*: implements against Forge's spec in a branch/worktree; must run typecheck/tests before claiming done; output = diff + test results, never "I did it."
**Probe — Test & Review** *(Sonnet)*: adversarial reviewer — tries to *refute* "done": runs the code, writes missing tests, checks edge cases. Reports to Forge but its verdicts are also visible to Sentinel/ATLAS (no burying bad news).

### GTM & Socials team

**Compass — GTM Lead** *(Opus-tier)*: owns positioning, content strategy, and the weekly GTM plan; decides *what* to post and *who* to reach out to — from Radar/Herald/Pulse inputs; every decision is a written memo with reasoning + expected outcome (so you can audit judgment, not just output).
**Radar — Market & Trend Researcher** *(Sonnet)*: monitors the space — competitor moves, relevant conversations on X/LinkedIn, launch opportunities; cited briefs only; explicitly allowed to report "nothing worth acting on today" (silence-is-an-option kills forced content).
**Quill — Content Writer** *(Sonnet/Opus)*: drafts LinkedIn posts and X threads from Compass's angle memos + the brand-voice file; produces 2–3 variants; every factual claim in a post must trace to a Radar citation. One writer — voice consistency is a *feature* of single-writer design.
**Herald — Outreach Researcher (the "SDR")** *(Sonnet)*: builds target lists (reusing your Apollo + Happenstance + LinkedIn-import integrations), researches each person, drafts personalized emails **into the outreach queue you already have**. Hard rules: every personalization claim cites a fetched source; no send capability exists in its toolset; human-volume caps.
**Pulse — Analytics** *(Haiku/Sonnet)*: reads post engagement, reply rates, and pipeline outcomes; weekly "what worked / what didn't" memo that feeds back into Compass's strategy and Quill's style file. This closes the loop — trend-responsive content earns 2–3× reach, and the feedback loop is what makes the team *learn*.

### Ops & Quality (independent — reports to ATLAS, never to the team it checks)

**Sentinel — Verifier/QA** *(Opus-tier, high effort)*: adversarially verifies deliverables before they reach you: claims vs. sources, DoD vs. evidence, brand/safety rules on content, "would this embarrass us" check on outreach. Its verdicts: `confirmed / needs-work / refuted`. Two `needs-work` strikes → escalate to you.
**Ledger — Cost & Budget** *(mostly code, thin agent)*: per-task and per-day token/credit budgets; the 15× multiplier is real, so budgets are hard stops, not advisories. Flags anomalies (runaway loops, spawn storms) and can pause the board.
**Archive — Librarian/Memory** *(Haiku)*: maintains the company's memory — charters, brand voice, ICP, decision log, "lessons" file (each entry traceable to a real failure); prunes stale context so runs stay lean.

Start smaller than this and grow: the crawl-phase org is just **ATLAS + one specialist + Sentinel**.

---

## 4. Accountability machinery (how "employees" are actually held to account)

**Task contract (every delegation, no exceptions)** — stored as a Convex row:

```ts
{
  id, parent_task, assignee, priority,
  objective: string,           // what & why, not just what
  context_refs: ArtifactId[],  // full traces where interdependent — not one-line summaries
  definition_of_done: string[],// machine-checkable where possible
  output_schema: zodSchema,    // typed handoff
  budgets: { tokens, tool_calls, wallclock, credits },
  boundaries: string[],        // explicitly out of scope
  status: 'queued'|'in_progress'|'blocked'|'delivered'|'verified'|'rejected'|'escalated'
}
```

**Honest-status protocol** — the anti-hallucination core. Every deliverable must carry one of:
- `complete` + evidence (citations, test output, diff)
- `partial` + what's missing and why
- `blocked` + what's needed
- `low-confidence` + which specific claims are uncertain

Charters reward `blocked`/`low-confidence` explicitly ("a correct 'I couldn't verify this' is a success; a confident guess is a firing offense"). Structurally, agents can't self-certify: **status flips to `verified` only when Sentinel or Probe signs, and to `done` only when the human gate (if any) clears.**

**Verification ladder** (match cost to stakes):
1. *Mechanical* (free): schema validation, tests pass, links resolve, citations exist — code, not LLM.
2. *Peer/QA* (cheap): Probe for code, Sentinel spot-checks for research/content.
3. *Adversarial* (expensive, for externally visible things): Sentinel actively tries to refute claims against primary sources.
4. *Human* (you): everything that leaves the building.

**Escalation rules**: 2 failed verification rounds → up a level. Budget 80% consumed with DoD unmet → report, don't silently push on. Contradiction between two agents' findings → ATLAS resolves with sources or escalates. Anything irreversible → always you.

**The daily brief** — ATLAS compiles into your existing morning digest: shipped (verified), in flight, blocked/escalated, *awaiting your approval* (posts, emails, merges), spend vs. budget, and one "company health" line (verification failure rate, cost per deliverable). Accountability to *you* is a pull-free, one-page ritual.

---

## 5. Sync & communication

- **The task board is the sync mechanism** — a Convex table, live-subscribable, so agents (and your UI) see state changes in real time. No agent-to-agent chat: peer communication happens through artifacts and the board (bounded collaboration — the only kind that survived).
- **Artifacts over messages**: every handoff is a persisted, typed artifact (brief, spec, diff, memo, draft) with provenance (who, from which task, citing what). Anyone downstream can drill to raw sources.
- **Shared memory, partitioned context**: Archive's files are the company's long-term memory; each agent's context is assembled per-task from (charter + task contract + referenced artifacts) — small, relevant, fresh. Compaction/summarization is allowed for *narrative*, never for *evidence* (citations travel intact).
- **Workpool concurrency caps** prevent spawn storms; parallel fan-out only for read/research tasks.

---

## 6. The GTM & Socials team — reality constraints (this is where people get burned)

**The one rule that decides success**: the research says the fully-autonomous version of this team fails (50–70% of AI-SDR pilots cancelled by day 90; Level-3 autonomous social posting "doesn't exist in production yet"), while the *decide-and-draft, human-approves-send* version thrives. Dayspring's DNA — "nothing sends itself, no credit spent without a click" — is already the winning pattern. The agents make real decisions (what to post, who to contact, when, why); you spend ~10 minutes a day tapping approve/edit/reject. Each rejection, with one line of reason, feeds Archive's lessons file — the team learns your taste.

**LinkedIn**: no post-search API and automation tools are explicitly against ToS (account restriction tiers are real; permanent bans rarely appealed successfully). Posting your *own* content via the official UGC/Community-Management API is legitimate but partner-gated; the pragmatic path is agent-prepared posts delivered to you (or a scheduler like Typefully/Buffer that has official access) for one-tap publishing. Your existing Apify post-search stays a *research* input, same risk posture as today.
**X**: pay-per-use API (2026): ~$0.015/post, $0.20 if it contains a URL; likes/follows/quote-automation are Enterprise-only. Posting via API is fine and cheap; behavioral-pattern suspensions exist independent of rate limits, so keep cadence human-shaped.
**Email**: reuse your Gmail outreach queue as-is. Caps at human volume (tens/day, not hundreds), warmup, SPF/DKIM/DMARC, <0.3% complaint rate, CAN-SPAM/GDPR fields. Herald researches and drafts; the queue-with-a-click remains the only path out.
**Brand-voice + banned-topics files** are hard context for Quill and hard *checks* for Sentinel (claims without citation, sensitive topics, cringe/engagement-bait patterns, anything about real people that isn't sourced).
**Metrics loop**: Pulse reads engagement (X API reads are cheap; LinkedIn via your own post stats) + reply/meeting rates from the pipeline → weekly strategy memo → Compass adjusts. Without this loop the team is a content cannon; with it, it compounds.

**The mission (decided):** the GTM team promotes **Areef's personal brand — landing jobs and promoting his side projects** (Klyro, AirLog, Hound, Dayspring itself). This collapses beautifully into the existing product: the ICP is recruiters, hiring managers, and engineers at tracked/target companies — *the same people already in Dayspring's pipeline*. Radar watches hiring conversations and dev-tool discourse; Compass's content strategy is build-in-public + job-search-relevant expertise; Quill writes in Areef's voice about what he's actually shipping; Herald's outreach *is* Dayspring's outreach queue, now upgraded with brand-aware angles ("saw your post about X" works both directions); Pulse correlates posts ↔ profile views ↔ replies ↔ interviews. The orchestra's GTM team is effectively Dayspring's warm-applications thesis, extended to the demand side: make the applications warmer by making the applicant known.

---

## 7. Cost expectations

- Multi-agent ≈ **15× chat tokens**; token spend explains ~80% of performance variance, but **model choice beats budget** (upgrading the model outperformed doubling tokens).
- Practical translation: a daily full-org run with Opus orchestrator/verifier + Sonnet workers will land in the **single-digit dollars/day** range if budgeted, unbounded if not. Ledger's hard caps are not optional.
- Cheap wins: Haiku for classification/formatting, prompt caching on charters (you already cache the profile prompt), batch overnight scoring (already on your roadmap), "silence is an option" for Radar (no forced daily content).

---

## 8. Build path (crawl → walk → run)

**Phase 1 — one employee, full accountability spine (a weekend):** Convex tables (`orch_tasks`, `orch_artifacts`, `orch_reports`) + ATLAS + **Radar** + Sentinel on a daily durable workflow. Output into your morning digest. *You're not testing agents; you're testing the harness: task contracts, honest-status, verification, budgets.*
**Phase 2 — the GTM loop (week 2–3):** add Compass, Quill, Pulse + approval UI (a `/company` page with approve/edit/reject on drafts) + X API posting for approved posts + brand-voice and lessons files.
**Phase 3 — outreach lane:** Herald wired to Apollo/Happenstance/outreach queue with citation-gated personalization.
**Phase 4 — eng team:** Forge/Scout/Mason/Probe via Claude Agent SDK sessions (repo work needs filesystem/terminal), reporting into the same board. This is also where you decide how the orchestra relates to Claude Code sessions you run by hand.
**Phase 5 — self-improvement:** rejection-reasons → lessons file automation; Pulse-driven strategy updates; charter evolution with your sign-off (fail-once-fix-forever, institutionalized).

Evaluate like Anthropic: start with ~20 representative tasks, grade with an LLM judge + your own spot checks, iterate on prompts/charters where the failure rate is visible.

---

## 9. Decisions

**Locked:**
1. ✅ **GTM subject: personal brand** — landing jobs + promoting side projects (see the mission note in §6). ICP = recruiters/hiring managers/engineers at target companies; content pillars = build-in-public (Klyro, AirLog, Hound, Dayspring) + job-search-relevant engineering expertise.
2. ✅ **The orchestra lives inside Dayspring** — Convex durable workflows in the existing app, reusing auth, vault, Gmail queue, Apollo/Happenstance/Apify integrations, morning digest, and the UI (new `/company` section).

**Still open:**
3. **Approval surface**: in-app `/company` page, the morning email digest with approve links, or push-style (e.g., a daily Claude/Telegram check-in)?
4. **X account + posting API**: do you have (or want) the pay-per-use X developer account? LinkedIn: manual one-tap publish vs. a scheduler with official API access?
5. **How autonomous should Phase-5 self-improvement be** — can agents edit their own charters with your sign-off, or is that always hand-written?

---

## Sources

- [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Cognition — Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents)
- [LangChain — How and when to build multi-agent systems](https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems)
- [Micheal Lanham — Multi-Agent in Production in 2026: What Actually Survived](https://medium.com/@Micheal-Lanham/multi-agent-in-production-in-2026-what-actually-survived-f86de8bb1cd1)
- [Towards Data Science — Escaping the 17× Error Trap of the "Bag of Agents"](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/)
- [Addy Osmani — Agent Harness Engineering](https://addyosmani.com/blog/agent-harness-engineering/)
- [Claude Agent SDK vs LangGraph vs CrewAI — 2026 benchmark](https://pasqualepillitteri.it/en/news/3095/claude-agent-sdk-vs-langgraph-vs-crewai-benchmark-2026-en)
- [Convex — Durable Agents component](https://www.convex.dev/components/durable-agents) · [@convex-dev/agent workflows](https://github.com/get-convex/agent/blob/main/docs/workflows.mdx)
- [Leadgen Economy — The AI SDR Cancellation Wave: failure forensics](https://www.leadgen-economy.com/blog/ai-sdr-cancellation-wave-failure-forensics/)
- [Admove — AI agents for social media: a no-hype guide for 2026](https://www.admove.ai/blog/ai-agents-for-social-media-guide)
- [SocialNexis — X API tiers in 2026: what automation survives](https://socialnexis.com/guides/x-api-basic-enterprise-automation-rules)
- [Yalc — Is LinkedIn Automation Safe in 2026?](https://www.yalc.ai/blog/is-linkedin-automation-safe/)
