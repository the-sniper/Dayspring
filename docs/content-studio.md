# Content Studio — the GTM team's content pipeline

*Lives at `/company/studio`, with the cross-platform calendar at `/company/studio/calendar`. Runs from the UI; nothing here needs a terminal or a Claude Code session.*

The autonomous daily run (`/company`, `lib/orchestra/run.ts`) decides for itself what's worth saying and produces 0–2 posts with no human in the loop until the approval queue. The Studio is the opposite shape: a **campaign with a date range, a schedule, and three checkpoints**, where the CEO edits the plan, picks the hooks, and approves the drafts. Both share one team, one memory, one ledger, and one task board.

## The unit of work is a SLOT

A slot is **a date + a platform + a topic**. Research is keyed to the *topic*; drafting is keyed to the *slot*. That's what makes cross-posting affordable: a topic that runs on LinkedIn, X and Reddit is researched **once** and written **three times**, each to its own platform contract, with its own hooks.

```
launcher            objective · date range · platforms · target volume · your topics
  ↓ researching     Radar scouts 10-14 candidates → Compass ranks → Compass PLANS the schedule
  ↓ CHECKPOINT 1    you edit the plan: switch slots off, move dates, retarget subreddits, toggle images
  ↓ deep_research   Delve researches each unique topic IN PARALLEL → Spark writes 5 hooks PER SLOT (one call)
  ↓ CHECKPOINT 2    you pick a hook per slot (or "let the writer choose")
  ↓ drafting        Quill drafts each slot IN PARALLEL to its platform's rules →
                    Hone polishes (batched) → Easel writes image briefs (batched) →
                    Sentinel audits everything (batched)
  ↓ CHECKPOINT 3    approve (with your edits) / revise / skip — per draft, each on its scheduled day
  → approved posts land in the SAME queue as the daily run's, and on the calendar
```

Several campaigns can run at once; the Studio has a switcher.

## Platforms

`shared/platforms.ts` is the single source of truth for what each surface demands — length, hashtags, whether it needs a title, whether an image typically earns its place, and the rules fed verbatim into the writer, the editor and the auditor.

| | LinkedIn | X | Reddit |
|---|---|---|---|
| Length | 150–250 words | ≤280 chars | 200–500 words |
| Title | — | — | **required, separate field** |
| Channel | — | — | subreddit |
| Hashtags | ≤3 | ≤1 | **never** |
| Images typical | yes | yes | no |

Reddit's rules are the strictest and the most opinionated, because the failure mode there is not a weak post — it's a ban. The charter forbids marketing cadence, hashtags, engagement bait, and undisclosed self-promotion.

## Editing and version history

Every draft and every approved post keeps its **last 10 versions**. A version is banked whenever the text is replaced — by your own "Save edit", by the editor's revision, or by approving with changes. You can open any version and load it back.

The history is **cleared when the post ships** (logging its metrics marks it posted). It exists to support the edit loop, not to accumulate an archive.

`aiText` is separate and never touched: it's the frozen original the "how much did the human change?" measure reads.

## Images

The team writes the **brief**, never the image. Easel (Colin) produces a prompt complete enough to paste into any image tool unedited, plus alt text and an aspect ratio, and explains what the image does for the post. You generate it, attach it wherever you're posting, and tick "image ready" — which shows up on the calendar so an un-generated image can't quietly ship as a text-only post.

Charts and diagrams may only use numbers already in the post. No real faces, no real logos, no invented data.

## The calendar

`/company/studio/calendar` — a month grid across all three platforms with four states:

- **planned** — the team scheduled it; no words written yet
- **needs your call** — drafted, waiting on checkpoint 3
- **ready to post** — approved, waiting for its day
- **posted** — shipped, with metrics if you logged them

Filter by platform, click any campaign item to open it in the Studio.

## Memory: symmetric by construction

Everything the Studio can add to memory, it can remove:

| Added by | Removed at |
|---|---|
| Skipping a draft with a reason → lesson | Studio memory panel, or Team page |
| "This sounded like me" → voice sample | Studio memory panel, or Team page |
| Applying a Pulse proposal → do/don't/pillar/banned/lesson | Team page (per-list remove) |

`applyStrategyProposal` is append-only by design — a proposal can add a line, never rewrite or delete one. Deletion is always a human action.

## Where things live

| Piece | File |
|---|---|
| Platform contracts | `shared/platforms.ts` |
| State machine + checkpoint mutations | `convex/campaigns.ts`, `orchCampaigns` in `convex/schema.ts` |
| Post editing, history, calendar query | `convex/orchestra.ts` |
| Stage engine | `lib/orchestra/campaign.ts` |
| One metered, budget-guarded, envelope-validated model call | `lib/orchestra/callcore.ts` (shared with the daily run) |
| Charters (prompt text — edit these) | `lib/orchestra/charters/{radar-topics,compass-rank,compass-plan,delve,spark,quill-post,hone,easel,pulse}.txt` |
| Typed stage contracts | `lib/orchestra/types.ts` |
| Strategy review + proposals | `lib/orchestra/strategy.ts` |
| Background stage runner | `app/api/orchestra/campaign/route.ts` |
| Checkpoint + memory actions | `lib/actions/campaign.ts` |
| UI | `app/company/studio/**`, `components/campaign-*.tsx`, `content-calendar-view.tsx`, `post-performance-panel.tsx`, `strategy-review-panel.tsx`, `memory-quick-panel.tsx` |

## The rules that are enforced in code, not in prompts

- **A stage can't run twice.** `advanceStage` is a compare-and-swap on `stage`; the API route dedupes in-process and treats a stage older than 12 minutes as dead.
- **A stage can't start itself.** Only `researching`, `deep_research` and `drafting` are runnable; everything else is a checkpoint waiting on a human.
- **Only enabled slots cost money.** Switching a slot off in the plan is how you control spend.
- **Plan dates are clamped** to the campaign's range — a slot outside it is a planning error, not a new range.
- **Approval is the only path to the post queue.** `decideDraft` is the sole writer of campaign posts into `orchPosts`.
- **Over-length can't be approved.** The Approve button is disabled when the draft breaks its platform's limit.
- **Nothing is silently lost.** A draft that fails while its siblings succeed, a polish pass that throws, an audit that didn't run — each writes a line into `campaign.notes`, shown above the drafts.

## Cost shape

A 2-post single-platform campaign measured ≈ **$1.15** end to end. Per-topic stages scale with topic count; the cross-slot stages (hooks, polish, images, audit) stay at one call each regardless of size, so a 6-slot campaign across three platforms costs far less than 3× a 2-slot one.

Everything goes through the same `ORCHESTRA_DAILY_CAP_USD` ledger cap as the daily run — a campaign and a daily run share one day's budget, and a campaign that hits the cap fails the stage rather than overspending.

## Adding to the team

New employees go in `lib/orchestra/registry.ts` (add the id to `CODENAMES` too, so charters get themed) and get a charter `.txt`. Drop a `public/avatars/<role-id>.png` to give them a portrait; without one they render as an initial.

**When you write a charter, print the exact JSON envelope shape.** Describing it in prose ("then the standard envelope extended with `topics`") is how the first Radar scout run failed: the model returned a valid base envelope with the required array missing.
