# Agent Orchestra — Final Plan

*The build plan. Supersedes nothing — `agent-orchestra-brainstorm.md` (design rationale) and `agent-orchestra-costs-and-evals.md` (economics, evals) remain the reference docs. This is what we execute, pending go-ahead.*

---

## 1. What we're building (one paragraph)

A company of agents living inside Dayspring's Convex backend. **Atlas** (orchestrator) reports to Areef; specialists do bounded work under task contracts; **Sentinel** independently verifies everything before it reaches Areef; nothing external (post, email, merge) ever ships without a human tap. Mission of the GTM side: grow Areef's personal brand to land jobs and promote his side projects — same ICP as Dayspring's existing pipeline. Topology: shallow hub (orchestrator → workers → verifier → human gate), durable Convex workflows, agent loops with hard budgets, harness-engineered accountability.

## 2. Decisions locked

| # | Decision | Choice |
|---|---|---|
| 1 | GTM subject | Personal brand: job search + side projects (Klyro, AirLog, Hound, Dayspring) |
| 2 | Where it lives | Inside Dayspring (Convex `@convex-dev/agent` + `workflow` + `workpool`) |
| 3 | Models | Opus 5: Atlas, Sentinel · Sonnet 5: specialists · Haiku 4.5: grunt tier |
| 4 | Budget | Ledger hard cap **$5/day** company-wide; per-task ceilings in every contract |
| 5 | External actions | Human-gated forever (posts, emails, merges) — constitutional, not earned |

**Defaults I've chosen for the remaining opens (overridable at go-ahead):**

| # | Open item | Default |
|---|---|---|
| 6 | Approval surface | New **`/company` page** in Dayspring (approve/edit/reject queue) + summary in the existing morning digest |
| 7 | X posting | Pay-per-use X API (posts ~$0.015; you create the developer account) |
| 8 | LinkedIn posting | **Manual one-tap**: Quill's approved post + "copy" button; no automation, zero ToS risk |
| 9 | Self-improvement autonomy | Agents *propose* charter edits with evidence; only you merge them |

## 3. The build — five phases, each independently shippable

### Phase 0 — Prep (one evening)
- [ ] `npx convex ai-files install`; add `@convex-dev/agent`, `@convex-dev/workflow`, `@convex-dev/workpool`
- [ ] X developer account (pay-per-use tier) — can lag until Phase 2
- [ ] Confirm Anthropic key budget alert at $10/mo (safety net under the Ledger cap)

### Phase 1 — The accountability spine (a weekend) → ~$35/mo
**Hire: Atlas, Radar, Sentinel.** The point is to prove the harness, not the agents.
- Convex tables: `orchTasks` (contracts: objective, DoD, budgets, boundaries, status), `orchArtifacts` (typed outputs + provenance + citations), `orchReports` (daily briefs), `orchIncidents` (hallucination/verification failures), `orchLedger` (spend per task/day)
- Ledger as **code** (not an agent): token metering, hard stops, spend queries
- Charters (≤60 lines each) for the three roles; honest-status protocol (`complete/partial/blocked/low-confidence` + evidence) enforced by output schema
- Daily durable workflow: Atlas plans → Radar researches (batch, cached) → Sentinel verifies → brief lands in morning digest
- Prompt-caching discipline from day one (stable-prefix structure, shared company preamble)
- **Golden suite v0**: 20 frozen Radar tasks from real feed history
- **Exit criteria**: 7 consecutive clean daily runs · cost ≤ $1.50/day · first-pass yield and honesty metrics visible in a query · at least one *warranted* `blocked`/`low-confidence` observed (proof the honesty protocol works)

### Phase 2 — Content loop (week 2–3) → ~$50/mo
**Hire: Compass, Quill, Pulse.**
- Memory files: brand-voice, ICP, banned-topics, lessons (all ≤1 page, cached prefix)
- `/company` page: pending-approval queue with approve / edit / reject-with-reason; rejections append to lessons file
- X API posting on approve; LinkedIn one-tap copy flow
- Pulse weekly memo (batched Haiku): engagement + reply data → Compass
- Golden suites for Quill (vs your actually-approved posts) and Compass
- **Exit criteria**: 2 weeks of cadence · approve-without-edit ≥ 50% · zero factual-correction incidents · silence-is-an-option exercised at least once (no forced content)

### Phase 3 — Outreach lane (week 4) → ~$63/mo
**Hire: Herald**, wired to existing Apollo/Happenstance/LinkedIn-import + Gmail outreach queue.
- Citation gate: every personalization claim carries a source URL fetched this run — mechanically enforced (schema requires it), Sentinel audits it, no source ⇒ claim deleted
- Volume: ≤10 researched prospects/day into the queue; sends stay on your existing click-to-send
- **Exit criteria**: 20 drafts audited with **zero** unsourced claims · reply-rate baseline established
- **Kill rule**: one hallucinated-fact incident reaching a sent email ⇒ Herald pauses, post-mortem, charter fix before resume

### Phase 4 — Eng team (month 2) → +$30–60/mo metered (own Ledger cap)
**Hire: Forge, Mason, Probe** (Scout deferred) as Claude Agent SDK sessions on the repo, reporting into the same `orchTasks` board via MCP.
- Deterministic gates first: typecheck + tests = free, non-negotiable "Probe layer 0"
- Evaluate Max-subscription lane if usage runs hot
- **Exit criteria**: 3 features shipped through the pipeline; merge-without-revert 100%

### Phase 5 — Self-improvement (month 2–3, ongoing) → +$5/mo
- Rejection-reasons → lessons file automation; monthly calibration: re-run all golden suites
- Model-demotion trials (Luna vs Haiku; open-weight leaf swaps) — suite-gated
- Quarterly review ritual: scorecards + outcome KPIs + your 30 minutes

## 4. The bill

| Milestone | Monthly |
|---|---|
| Phase 1 live | ~$35 |
| Phase 3 live (full GTM) | ~$63 → **~$45–50 after §7 token-diet playbook** |
| Everything incl. light eng | **~$100–125** (+X API ~$5) |
| Hard ceiling (Ledger-enforced) | whatever you set — default config caps at $150 + eng lane |

## 5. Risks & mitigations (the short list)

- **Compounding hallucination** → citations travel intact; Sentinel checks claims against sources; incidents table; kill rules.
- **Cost runaway** → Ledger hard stops, spawn caps, per-task budgets, batch+cache defaults.
- **Verifier rubber-stamping** → weekly random human re-audit of Sentinel's confirms (its false-confirm rate is *its* KPI).
- **Platform risk** → no LinkedIn automation at all; X via official API at human cadence; email stays on the existing human-click queue.
- **Scope creep into a deep org** → constitution: max 2 delegation levels, every new role must add exogenous information or a genuine check.

## 6. What I need from you

1. **Go-ahead** (or edits) on this plan and the four defaults in §2.
2. When we start Phase 2: an X developer account, and 3–5 of your past posts you consider "your voice" (seeds the brand-voice file).
3. 15 minutes after week 1 to review the first scorecard and calibrate Sentinel's strictness.

---

*On approval: we start with Phase 1 — schema + charters + the daily workflow — and nothing gets built beyond it until its exit criteria pass.*
