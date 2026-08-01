# Agent Orchestra — Economics & Performance Management

*Companion to `agent-orchestra-brainstorm.md`. Covers: what it costs, which model works which job, local vs hosted, and how employees get performance-reviewed.*

---

## 1. The pricing landscape (August 2026)

### Anthropic API (per 1M tokens)

| Model | Input | Output | Role in the orchestra |
|---|---|---|---|
| Claude Fable 5 | $10 | $50 | Not needed — reserve for one-off hard problems |
| Claude Opus 5 | $5 | $25 | Orchestrator (Atlas), Verifier (Sentinel) |
| Claude Sonnet 5 | $2 / $10 *(promo → $3 / $15 after Aug 31, 2026)* | | All specialists and leads |
| Claude Haiku 4.5 | $1 | $5 | Grunt work: classification, extraction, formatting, Archive |

**The two multipliers that matter more than the sticker price:**

- **Prompt caching**: cache hits cost **10%** of the input rate (5-min writes +25%, 1-hr writes +100%). Agent loops re-read their context on *every* turn — a 20-tool-call research loop reprocesses the same prefix 20 times. Caching turns that from your biggest cost into a rounding error. Charters, brand-voice file, board snapshot → always in the cached prefix.
- **Batch API**: **50% off**, and it *stacks with caching*. Anything that runs overnight and nobody is waiting on (daily Radar sweep, scoring, Pulse aggregation) belongs in batch. Batched + cached Sonnet input is effectively $0.15–0.30/M.

Also note: **output tokens are 5× input price** on every tier. Schema-constrained terse outputs (which you want anyway for typed handoffs) are a cost feature, not just a quality feature.

### OpenAI API (per 1M tokens)

| Model | Input | Output | Notes |
|---|---|---|---|
| GPT-5.6 Sol (flagship) | $5 | $30 | Peer of Opus 5; edges ahead only at max reasoning effort |
| GPT-5.5 | $5 | $30 | 2–3 pts above Sonnet 5 on AA Index *at max effort*; gap closes at standard depth |
| GPT-5.6 Terra (mid) | $2 | $12 | Credible Sonnet-5 alternate at near-identical price |
| GPT-5.6 Luna (budget) | $0.20 | $1.20 | **5× cheaper than Haiku 4.5** — the standout of the lineup |
| GPT-5 nano | $0.05 | — | Trivial classification only |
| GPT-5.5 Pro | $30 | $180 | Escalation-of-last-resort tier (like Fable) |

Caching: hits at 10% of input rate (writes 1.25×, ~30-min persistence — shorter-lived than Anthropic's 1-hr option, which matters for spaced-out daily runs). Batch: 50%, same as Anthropic. Watch: long-context requests trip a separate ~2× input meter.

**Where OpenAI genuinely fits the orchestra (beyond price):**

1. **Cross-vendor verification.** Sentinel running on the *same model family* as the workers it audits shares their blind spots — same training data, same failure modes, same "sounds plausible" priors. A second-opinion pass from a different vendor on externally-visible items (posts, outreach) de-correlates errors. This is the judge-diversity argument, and it's the strongest case for multi-vendor in this design.
2. **GPT-5.6 Luna in the grunt tier.** At $0.20/$1.20 it undercuts Haiku 4.5 five-fold; if it passes the leaf-role golden suites, that's free money on the highest-volume tier.
3. **Second-opinion escalation.** When a task fails verification twice on Claude, a retry on a different vendor sometimes succeeds where a same-family retry just repeats the mistake — worth having as the escalation ladder's last rung before `blocked → human`.

**Where it doesn't:** the practitioner comparisons consistently put current Claude ahead on long-horizon *agentic* behavior — tool-heavy loops, multi-file coding, error recovery — which is precisely the orchestra's workload, while GPT-5.5/5.6's edge shows up on single-shot maximum-effort reasoning. And the workhorse math favors Sonnet: agent spend concentrates in output tokens, where Sonnet 5 is 2–3× cheaper than GPT-5.5. One vendor-comparison caveat worth internalizing verbatim: judge by **cost per accepted task** (retries, review time, output length), not per token — and don't split traffic across vendors for the sake of architecture diagrams. Your `package.json` already carries the `openai` SDK and the Convex agent component is provider-agnostic, so each of these is a config change gated on a golden-suite run, not a rewrite.

### Open-weight models (hosted APIs, per 1M tokens)

| Model | Size (total/active) | Hosted price (in/out) | Agentic reality check |
|---|---|---|---|
| GLM-5.2 | 753B / 40B | ~$1.40 / $4.40 | Strongest open agentic coder (SWE-bench Pro 62.1); real orchestration candidate |
| DeepSeek V4 Flash | 284B / 13B | ~$0.14 / $0.28 | Absurdly cheap; fine for leaf research/extraction, not for judgment calls |
| Kimi K2.6 | 1T / 32B | ~$0.95 / $4.00 | Multimodal, agent-positioning; swarm claims unproven in production |
| Qwen3-Coder-Next | 80B / 3B | ~$0.11 / $0.80 | The realistic *local* option; weaker absolute benchmarks (42.7 SWE-bench Pro) |
| Mistral Small 4 / Large 3 | 119B / 675B | $0.15–0.60 / $0.50–1.50 | Solid mid-tier with vendor backing |

The 2026 practitioner consensus, verbatim: **"keep closed frontier models in the route for the hardest, highest-risk, or most ambiguous work"** — open-weight wins on high-volume, well-specified, low-stakes work.

---

## 2. Model-per-role assignment (the cost/value matrix)

The principle from Anthropic's production data: **model choice beats token budget** (upgrading the model outperformed doubling the token spend). So spend where errors compound, save where they don't.

| Where errors compound | Where they don't |
|---|---|
| Atlas (a bad plan poisons every downstream task) | Radar's raw link-gathering |
| Sentinel (a false "confirmed" defeats the whole accountability design) | Formatting, classification, extraction |
| Compass's strategy memos (a bad decision executed well is still bad) | Pulse's metric aggregation |
| Quill's final drafts (externally visible, your name on it) | Archive's file maintenance |

**Recommended ladder:**

- **Opus 5** — Atlas, Sentinel. Two agents only. These are ~15–20% of tokens but they're the brain and the conscience.
- **Sonnet 5** — Compass, Forge, Quill, Herald, Radar, Scout, Mason, Probe. The workhorse tier; current Claude-generation Sonnet is what Anthropic itself runs subagents on.
- **Haiku 4.5** — Pulse aggregation, post-classification, entity extraction, digest formatting, Archive. Anything with a checkable, narrow output.
- **Open-weight (hosted) as a Phase-3+ optimization** — swap DeepSeek-Flash/Qwen-tier models into the Haiku slots and *measure* (see §5); only promote the swap if the golden-task pass rate holds. The Convex agent component is model-agnostic (AI SDK provider interface), so per-role provider mixing is a config change, not a rewrite.

**Routing pattern — escalate on failure, not by default**: leaf tasks start on the cheap tier; if mechanical checks or Sentinel bounce the output, the retry runs one tier up. You pay Opus prices only for the tasks that proved hard. (Cap: one escalation, then `blocked` → human. Endless retry ladders are their own cost bug.)

**A subscription loophole worth knowing**: the Product & Eng team (Phase 4) runs as Claude Agent SDK sessions on your machine — that usage can ride a Claude Max subscription's flat rate rather than metered API, which for heavy coding-agent use is dramatically cheaper. Anthropic restructured SDK billing in mid-2026 (separate credit pools), so verify current terms when you get there. The Convex-side orchestra is headless and will always be metered API.

---

## 3. What the orchestra actually costs (worked example)

Daily Phase-2 GTM run, honest loop-aware token estimates (agent loops re-read context every turn — that's why input dwarfs output):

| Agent | Model | Tokens (in / out) | Naive | With caching |
|---|---|---|---|---|
| Atlas — plan, assign, synthesize, brief | Opus 5 | 120k / 10k | $0.85 | ~$0.45 |
| Radar — research sweep, ~20 tool calls | Sonnet 5 | 300k / 12k | $1.08 | ~$0.35 |
| Compass — strategy/angle memo | Sonnet 5 | 60k / 6k | $0.27 | ~$0.15 |
| Quill — 2–3 post drafts | Sonnet 5 | 40k / 8k | $0.24 | ~$0.18 |
| Sentinel — verify externally-visible items | Opus 5 | 100k / 6k | $0.65 | ~$0.35 |
| Haiku grunt — classify, extract, format | Haiku 4.5 | 80k / 8k | $0.12 | ~$0.06 |
| **Daily total** | | ~700k / 50k | **~$3.20** | **~$1.55** |

- Push Radar + Pulse into the Batch API overnight → **≈ $1.10–1.30/day → $35–40/month** for the full GTM company.
- Add Herald (outreach research is the token hog: per-prospect fetching) at ~10 prospects/day ≈ +$0.50–1.00/day.
- Phase-4 eng team is the wild card — coding agents burn 10–50× a research agent per task. On API expect $5–20 per meaningful feature; on a Max subscription, flat.
- Swap the leaf tier to DeepSeek-Flash-class models and the GTM run drops toward **$0.60–0.80/day** — worthwhile *only after* the golden-task suite exists to prove nothing regressed.

**Sanity anchor**: multi-agent ≈ 15× chat tokens (Anthropic). The design absorbs that via caching (kills loop re-read cost), batch (kills urgency you don't need), shallow topology (kills pass-through re-summarization), silence-is-an-option (kills forced work), and Ledger's hard caps (kills runaways). A $40–80/month GTM department that measurably increases warm replies is one of the cheapest employees on earth; the same department without budgets can hit that *per day*.

---

## 4. Local vs hosted

Sharp version of the tradeoff: **"open-weight" ≠ "local."** Three tiers, not two:

**1. Frontier hosted (Anthropic API)** — the default here. Highest per-token price, lowest engineering overhead, best judgment. At your scale (single-user, ~$1–3/day), the *dollar* difference between this and anything else is small; the *quality* difference on ambiguous work is not. Also fits Dayspring's bring-your-own-keys design as-is.

**2. Open-weight hosted (DeepSeek/GLM/Qwen via their APIs or OpenRouter)** — the real cost lever if volume grows 10×. 5–20× cheaper at the leaf tier, no hardware, swap per-role. Costs you: a second provider dependency, more variance in tool-calling reliability, and eval discipline becomes mandatory rather than nice-to-have.

**3. Actually local (your MacBook Pro)** — Qwen3-Coder-Next (80B/A3B, Apache 2.0) quantized is the flagship realistic option; needs ~64GB unified memory to run well, and smaller Qwen/Mistral variants below that. Honest assessment for this project:

- *For:* $0 marginal cost, privacy (though your sensitive data already lives locally by design), offline, fun.
- *Against:* tool-calling reliability is the exact dimension where small local models lag most — and the orchestra's whole design is tool loops with typed contracts. Failure shows up as retries and Sentinel bounces, i.e., you pay the "savings" back in escalations and your own debugging time. Plus: tokens/s throughput ties up your laptop while Convex-side agents can't reach it (the orchestra runs in the cloud; a local model would need a tunnel or a poll-a-queue worker).
- *Verdict:* wrong tool for the orchestra's core in 2026 at your volume. Right tool for two niches: (a) high-volume offline batch jobs you'd rather not meter (e.g., re-classifying a year of feed history), (b) an experiment lane — run the golden-task suite against a local model quarterly; the moment a local model passes the Haiku-tier bar, the swap is free money.

Decision rule: **hosted frontier for judgment, hosted open-weight for volume, local for hobbyist batch + future option value.** Revisit when (a) monthly spend crosses ~$150, or (b) a local model passes your leaf-tier golden suite.

---

## 5. Performance reviews — evaluating agents as employees

The accountability spine (task contracts + honest-status + verification) was designed so that **evaluation is a byproduct, not a separate project**. Every task row already records: who, what, DoD, budget, tokens spent, verification verdict, escalations, human edits. Performance review = queries over tables you already have.

### 5.1 The scorecard (continuous, mechanical, free)

Computed per agent per week by code, not by an LLM:

| Metric | What it measures | The employee-review analogy |
|---|---|---|
| **First-pass yield** | % of deliverables Sentinel/Probe confirm without rework | "Quality of work" |
| **Rework rate** | avg verification rounds per deliverable | "Needs supervision?" |
| **Honesty score** | `blocked`/`low-confidence` flags that were *warranted* vs hallucinated-done incidents caught by verification | "Integrity" — the single most important number in the whole system |
| **Budget adherence** | tokens/tool-calls/credits vs contract | "Works within constraints" |
| **Cost per verified deliverable** | spend ÷ confirmed outputs | "Salary vs output" |
| **Cycle time** | assignment → verified | "Delivery speed" |
| **Escalation quality** | escalations that were correct calls vs noise vs missed (should-have-escalated) | "Judgment" |

Trend matters more than level: a falling first-pass yield after a charter edit or model swap is your regression alarm.

### 5.2 Three-level evals (the 2026 standard)

1. **End-to-end** — did the task achieve its objective? LLM-as-judge against the contract's DoD, per-role rubric (accuracy, citation validity, completeness, brand fit for Quill, source quality for Radar). Anthropic's recipe: a single judge prompt scoring a rubric was more consistent with humans than juries of specialized judges.
2. **Trajectory** — was the *path* sane? Deterministic where possible: tool correctness (right tool for the step), argument correctness, step efficiency (redundant calls, loops), plan adherence. This is where "expensive but right" gets separated from "right by luck."
3. **Component** — when something fails, which node? Tracing (task id on every span) makes this a lookup, not an investigation.

Rule of thumb from the eval literature: **deterministic checks for exact things (tool calls, schemas, citations resolve, tests pass), LLM-as-judge only for quality of the output itself.** Judges drift; code doesn't.

### 5.3 Golden-task suites (the "certification exam")

Per role, ~20 frozen representative tasks with known-good outcomes (Anthropic started at exactly this scale and it was enough to see 30→80% effect sizes):

- Radar: 20 historical days of feed → does it surface the items you actually acted on?
- Quill: 20 angle memos → drafts judged against your *actual approved* posts as reference.
- Herald: 20 prospects with hand-verified facts → any unsourced personalization claim = automatic fail.
- Mason/Probe: 20 repo tasks with test suites.

Re-run the suite on **every charter edit, model swap, or framework upgrade**. This is what makes the cheap-model experiments in §2/§4 safe: demotion to a cheaper model is allowed *only* when the suite pass rate holds. It's also your hiring bar — a new role ships only after passing its exam.

### 5.4 Outcome KPIs (quarterly "business review", per role)

Scorecards measure *how* they work; these measure *whether the work matters*:

- **Radar**: % of briefs that led to acted-on content; Compass's rejection rate of its angles.
- **Quill**: approve-without-edit rate (your taste, learned); engagement vs trailing baseline; zero factual-correction incidents.
- **Compass**: did its weekly bets outperform? (Pulse tags each post/outreach wave with the memo that motivated it — decisions become auditable predictions.)
- **Herald**: reply rate, meetings/interviews sourced, **hallucination incidents = 0** (audited, not self-reported; the AI-SDR industry's <5% bar is too lax for your name).
- **Pulse**: were its recommendations adopted, and did adopted ones work?
- **Mason/Probe**: merge-without-revert rate; escaped defects (bugs found later that Probe passed).
- **Sentinel** — *who watches the watchman*: weekly random human re-audit of N confirmed items; its KPI is false-confirm rate. A verifier that rubber-stamps is worse than no verifier, because it launders confidence.
- **Atlas**: company-level numbers — verified-deliverable throughput, spend vs budget, % of your review time spent on things you approved (a proxy for "is the company sending me good work").

### 5.5 HR actions (what reviews actually trigger)

- **Coaching** = charter edit, traced to a specific failure (fail-once-fix-forever). Charters stay under ~60 lines; rules that don't trace to real failures are noise.
- **PIP** = agent's tasks temporarily routed through extra verification + tighter budgets until first-pass yield recovers.
- **Demotion/promotion (of the model)** = golden-suite-gated tier changes — the explicit mechanism by which costs go *down* over time with evidence instead of vibes.
- **Firing** = role deleted or merged; the org chart is code, headcount is free to change. (Corollary: resist inventing roles to look like a company — every agent must add exogenous information or a genuine check, per the MIT result that delegation without new signals only degrades decisions.)
- **Earned autonomy** = trusted agents get looser *internal* gates (e.g., Radar briefs stop requiring Sentinel spot-checks after 4 clean weeks; Quill graduates from 3 variants to 1). External actions — posting, emailing, merging — never graduate past you. That line is constitutional, not performance-based.

---

## 6. Final model choice & the monthly bill

Post-promo prices ($3/$15 Sonnet), 30-day month, caching + overnight batch as designed. Herald assumes 10 prospects/day on 22 weekdays; Quill ~16 posting days.

| Agent | Model | Daily tokens (in/out) | Est. monthly |
|---|---|---|---|
| Atlas — orchestrator | **Opus 5** | 120k / 10k | ~$13 |
| Sentinel — verifier | **Opus 5** | 100k / 6k | ~$10 |
| Radar — research (batched) | **Sonnet 5** | 300k / 12k | ~$8 |
| Compass — GTM lead | **Sonnet 5** | 60k / 6k | ~$5 |
| Quill — content | **Sonnet 5** | 40k / 8k | ~$4 |
| Herald — outreach research | **Sonnet 5** | ~400k / 20k | ~$20 |
| Pulse + grunt (classify, extract, format, Archive) | **Haiku 4.5** | 80k / 8k | ~$3 |
| **Full GTM company** | | | **≈ $63/month** |

Bracketing: **~$35/mo** in Phase 1 (Atlas + Radar + Sentinel only) → **~$50/mo** in Phase 2 (content loop) → **~$63/mo** at Phase 3 (outreach). Sloppy version without caching/batch: $120–150/mo — the discipline is worth ~2×. **Ledger cap $5/day → hard ceiling $150/mo** no matter what goes wrong.

Non-model line items: X API posting ~$1–7/mo (posts $0.015, $0.20 with URL; Pulse reads $0.005 ea) · Apollo / Happenstance / Apify — your existing credit spend, unchanged · Convex — current free/pro tier almost certainly absorbs the tables and workflows.

Optional lanes (post-golden-suite): cross-vendor Sentinel second-opinion on external items (GPT-5.6 Terra, +$3–5/mo) · Luna-for-Haiku swap (−$2.50/mo now; matters only at 10× volume) · Phase-4 eng team — metered API $30–100/mo *or* Claude Max flat $100–200/mo if usage is heavy (verify current SDK billing terms first).

**Bottom line: the whole GTM department costs about two DoorDash orders a month; the accountability layer (Opus on Atlas + Sentinel) is a third of the bill and is the last thing to cheap out on.**

### All-phases cumulative monthly

| Phase | Adds | Cumulative monthly (typical) | Range |
|---|---|---|---|
| 1 — Spine | Atlas + Radar + Sentinel | **~$35** | $25–45 |
| 2 — Content loop | Compass, Quill, Pulse/grunt | **~$50** | $40–65 |
| 3 — Outreach | Herald (10 prospects/day) | **~$63** | $55–85 |
| 4 — Eng team | Forge, Scout, Mason, Probe | **~$100–120** (light: few features/mo, metered) | +$30–60 light · +$75–150 daily-use metered · or flat via Max sub ($100–200) |
| 5 — Self-improvement | retro runs, lessons automation, charter proposals | **+$5** | $3–8 |

**Realistic full-org total: ~$100–125/mo metered (light-moderate eng use), ~$170–270/mo if the eng team runs hot enough to justify a Max subscription lane. Absolute worst case with Ledger caps enforced: GTM ceiling $150 + eng lane cap = the bill cannot exceed what you set, by construction.** Phase 4 is the only truly variable line — coding agents burn 10–50× a research task, so its budget deserves its own Ledger cap from day one.

## 7. Cost-reduction playbook: drop order, caching, token diet

### 7.1 Who gets laid off first (drop order, with savings on the ~$63 GTM bill)

| Order | Agent | Saves | How the job gets covered |
|---|---|---|---|
| 1 | Ledger | ~$0 | Was never really an LLM — implement as plain code (counters + caps). Drop the *agent*, keep the function. |
| 2 | Archive | ~$1–2 | Atlas maintains the lessons file; you hand-edit charters. |
| 3 | Pulse | ~$2–3 | Weekly batch instead of daily; or a Haiku one-shot inside Compass's run. |
| 4 | Compass | ~$5 | Atlas absorbs strategy (fine at this org size; watch Atlas context bloat). |
| 5 | Radar + Quill → one "Maker" | ~$5–6 | Single-threaded research→draft agent — Cognition-approved, zero handoff loss. |
| 6 | Herald | ~$20 | Pause the outreach lane; biggest single lever. |
| — | **Never: Atlas, Sentinel** | | The floor is 3 agents because accountability requires assigner ≠ doer ≠ checker. |

**Minimum viable company: Atlas + Maker + Sentinel ≈ $25–30/month** — still a real orchestra with the full accountability spine. Phase-4 eng roles have their own drop order: Scout first (Mason self-researches), then Probe *only if* its job is replaced by deterministic gates (tests must pass = free code, not LLM).

### 7.2 Caching — already designed in; the implementation rules

Caching is the single biggest lever (it's the difference between $3.20 and $1.55/day) and it's free if the prompts are *structured for it*:

1. **Stable → volatile ordering**: company preamble → charter → tool definitions → brand-voice/ICP files → *then* the task payload. One byte changed early in the prefix busts everything after it.
2. **No cache busters in the prefix**: timestamps, task IDs, "today is..." go in the suffix, never up top.
3. **Shared company preamble, identical across all agents** → cross-agent cache hits when the workflow runs agents back-to-back inside one TTL window. Sequence the daily run tightly for exactly this reason.
4. **5-min cache (1.25× write) for within-run reuse; 1-hr cache (2× write) only for Atlas**, who is consulted across the whole day.
5. **Cache tool definitions** — schemas are big and perfectly stable.
6. **Batch API stacks with caching** (50% × 90% = batched cached input at ~5% of list price).
7. In Convex: `providerOptions` → Anthropic `cache_control` breakpoints on the stable blocks.

### 7.3 Token diet — what works, honestly

The headline: **most agent tokens are tool outputs and context re-reads, not wordy prose.** Compress where tokens actually live, at full price:

- **Caveman-style terse prompting**: real but oversold — JetBrains measured **8.5%** output reduction across 86 real tasks (vs the 65% marketing claim), with zero accuracy loss. Do it (output tokens are 5× input), but via schema-constrained outputs + "no preamble, no restating" charter rules and per-role `max_tokens` caps — that captures most of it without a plugin.
- **Compress tool outputs, not instructions**: middleware-style compression of search results/logs/file reads is where the 60–95% numbers are real (measured 92% on code-search and incident-debugging payloads). Practical version for the orchestra: a **Haiku pre-filter** step — cheap model triages/extracts from raw tool output before the Sonnet/Opus agent ever reads it.
- **IDs + retrieval-on-demand** (already in the design): artifacts live in Convex; agents get excerpts and fetch more only if needed. Never inline a whole artifact "for context."
- **Compact formats for structured payloads**: TOON-style tabular notation instead of JSON for lists-of-objects handoffs (prospect lists, feed items) — 30–60% on those payloads, and zod can still validate after parse.
- **Charter tightening beats charter shrinking**: instruction-optimization tests show tighter skill files *raised* accuracy (+23.5%) at zero cost — the fail-once-fix-forever rule keeps charters lean and load-bearing.
- **The caching interaction (don't skip this)**: compressing the *cached* prefix saves tokens billed at 10% — nearly pointless. Compress the **variable suffix and outputs**, which bill at full price. And never caveman an instruction into ambiguity: one extra retry costs more than a hundred saved words. Optimize cost per *accepted* task.

Stacked realistically, 7.2 + 7.3 take the full GTM org from ~$63 to **~$45–50/month**, and the minimum-viable org to **~$20/month**. Below that, the lever is model demotion (Luna/open-weight swaps), not prompt surgery.

## 8. Recommended starting configuration

- Anthropic-only at launch: Opus 5 ×2 roles, Sonnet 5 everywhere else, Haiku 4.5 grunt tier. **Caching from day one** (it's the biggest lever and it's free to design for: stable prefixes, charters up front). Batch for overnight work.
- Ledger hard caps: $5/day company-wide to start, per-task token ceilings in every contract.
- Golden suites built in Phase 1 for the first three roles — *before* any cost optimization.
- Revisit at $150/month or at quarterly review: open-weight leaf swap trial, local-model experiment lane, Max-subscription lane for the eng team.
- OpenAI additions worth trialing once golden suites exist: GPT-5.6 Luna vs Haiku in the grunt tier (5× cheaper), and a cross-vendor Sentinel second-opinion pass on externally-visible deliverables (de-correlated verification).

## Sources

- [Claude API pricing, all models per 1M tokens (BenchLM, July 2026)](https://benchlm.ai/anthropic/api-pricing) · [CloudZero Claude pricing guide](https://www.cloudzero.com/blog/claude-api-pricing/)
- [Best open-weight models 2026: GLM-5.2 vs DeepSeek V4 vs Kimi K2.6 vs Qwen vs Mistral (Kingy)](https://kingy.ai/news/best-open-weight-ai-models-in-2026-glm-5-2-vs-deepseek-v4-vs-kimi-k2-6-vs-qwen-vs-mistral/)
- [LLM agent evaluation metrics 2026: tool calling, trajectories, trace-based evals (Confident AI)](https://www.confident-ai.com/blog/llm-agent-evaluation-complete-guide)
- [Anthropic — multi-agent research system (token economics, eval methodology)](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Multi-Agent in Production 2026 (MIT delegation result, error-amplification data)](https://medium.com/@Micheal-Lanham/multi-agent-in-production-in-2026-what-actually-survived-f86de8bb1cd1)
- [Agent Harness Engineering (charter discipline, evaluator splits)](https://addyosmani.com/blog/agent-harness-engineering/)
