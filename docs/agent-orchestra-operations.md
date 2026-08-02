# Running Your Company — The Operator's Manual

*Everything is done from the UI. The only terminal facts left: `npm run dev` + `npx convex dev` must be running (they always are while you use Dayspring), the morning automation is the launchd job you already installed once, and Mason is by nature a Claude Code session. Every decision, review, and control lives in the app.*

---

## Your three surfaces

| Surface | What it's for |
|---|---|
| **`/company`** | The daily cockpit: run the company, approve/reject its output, watch spend, read the report, file eng work, run retro/Forge/Probe |
| **`/company/team`** | The controls: who's working vs benched, model tier dial, calibration, company memory (voice/banned/lessons) |
| **Morning digest (email)** | The pull-free summary — the company report arrives with your existing digest |

---

## Daily — ~10 minutes

1. **Read the report** (digest email, or `/company` top card). The line that matters most: anything marked `ESCALATED` or `>>> awaiting YOUR approval <<<`.
2. **Clear the approval queue** (`/company`):
   - **Posts**: edit inline if close, then Approve → Copy → paste to X/LinkedIn → *Mark posted*. Reject with a **specific reason** — your reason is literally training data (it lands in the lessons memory the whole team reads tomorrow). "Too salesy, I never use exclamation marks" teaches; "no" doesn't.
   - **Outreach**: drafts appear in your existing `/outreach` queue — same review-and-send flow you already use.
3. **Glance at the four tiles**: Spend (red = cap hit), First-pass yield, Escalated, Incidents. Green-ish and boring is the goal.
4. If the run didn't fire automatically, hit **Run today**.

**Escalated task?** Expand it on the board, read Sentinel's notes, and either: reject the premise (do nothing — it dies), fix the cause (edit memory files, or reject-with-reason next time), or lower your expectation (the contract was too ambitious — Atlas will scale down tomorrow).

## Weekly — ~15 minutes

1. **Run weekly retro** (Operations row — Sundays it also fires automatically). Read Atlas's health memo and proposals. For each proposal: ignore it, or hit **Merge via eng** → it becomes a Forge spec → implement via a Claude Code session → **Run Probe** to gate it. Self-improvement never skips review.
2. **Audit the auditor**: expand 2–3 tasks Sentinel *confirmed* this week and spot-check one claim each against its source link. A rubber-stamping verifier is the one failure the system can't catch itself.
3. **Freeze a golden case** (`/company/team` → Calibration) if you're not at 20 yet.
4. **Check the scorecard** on the team page — a falling first-pass yield for one employee means its charter needs work (let the retro propose it).

## Monthly — ~20 minutes

1. **Run calibration** (`/company/team`). Compare against history — the table shows pass rates per tier.
2. **Consider the tier dial**: bill feels high and yield is strong → switch to Balanced, run calibration, keep it only if the pass rate holds (>10-pt drop = switch back). Quality suffering → switch up.
3. **Prune the lessons file** (memory editor): it caps at 40 lines; delete lessons that have clearly been internalized.
4. **The money question**: is the company earning its ~$40–80/month? Replies, interviews, engagement — Pulse formalizes this once posting metrics exist; until then, your judgment.

## The eng loop (all buttons, one Claude Code session)

1. Describe the work in **Request eng work** → File request.
2. **Run Forge** (Operations) → spec appears on the board with acceptance criteria.
3. Open a Claude Code session in the repo (this is Mason): "implement the spec on the company board" — or paste the spec.
4. **Run Probe** → layer 0 (typecheck) + adversarial diff-vs-spec review → verdict on the board with a fix list.
5. Verdict `CONFIRMED` → the commit is yours to make.

## Alarms — act, don't wait

- **Incident, severity HIGH** → read it today. If it's Herald, the outreach lane has already auto-paused for 7 days; fix the cause (usually a charter/memory edit via retro proposal) before it resumes.
- **Spend tile red** → Ledger stopped the company mid-day. Fine occasionally; daily = raise `ORCHESTRA_DAILY_CAP_USD` in `.env.local` or demote the tier.
- **Escalated > 2 (tile red)** → contracts and reality disagree; read Sentinel's notes before adding more work.
- **Calibration drop > 10 pts** → revert whatever changed last (charter merge or tier switch).

## The constitution (what you never delegate)

Posting, sending, merging, and spending credits are **yours** — the buttons that do them only exist on your side of the gate. Charter changes require your merge. That line is what keeps the other 95% safely automated.
