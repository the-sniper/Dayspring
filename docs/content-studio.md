# Content Studio — the GTM team's content pipeline

*Lives at `/company/studio`. Runs from the UI; nothing here needs a terminal or a Claude Code session.*

The autonomous daily run (`/company`, `lib/orchestra/run.ts`) decides for itself what's worth saying and produces 0–2 posts with no human in the loop until the approval queue. The Studio is the opposite shape: a **batch campaign with three checkpoints**, where the CEO picks the topics, picks the hooks, and approves the drafts. Both share one team, one memory, one ledger, and one task board.

## The pipeline

```
launcher            your ideas (verbatim) + focus + post count
  ↓ researching     Radar scouts 10-14 candidates (web) → Compass ranks a shortlist
  ↓ CHECKPOINT 1    you pick the topics
  ↓ deep_research   Delve researches each pick IN PARALLEL → Spark writes 5 hooks per topic (ONE call)
  ↓ CHECKPOINT 2    you pick a hook per topic (or "let the writer choose")
  ↓ drafting        Quill drafts each post IN PARALLEL → Hone polishes (one batched call)
                    → Sentinel audits everything (one batched call)
  ↓ CHECKPOINT 3    approve (with your edits) / revise (say what's wrong) / skip (with a reason)
  ↓ calendar        weekday slots, pillars interleaved — code, not a model call
  → approved posts land in the SAME queue as the daily run's, on /company
```

Approved → posted → you log the numbers → Pulse's strategy review reads them and proposes memory edits you apply by hand.

## Where things live

| Piece | File |
|---|---|
| State machine + checkpoint mutations | `convex/campaigns.ts`, `orchCampaigns` in `convex/schema.ts` |
| Stage engine | `lib/orchestra/campaign.ts` |
| One metered, budget-guarded, envelope-validated model call | `lib/orchestra/callcore.ts` (shared with the daily run) |
| Charters (prompt text — edit these) | `lib/orchestra/charters/{radar-topics,compass-rank,delve,spark,quill-post,hone,pulse}.txt` |
| Typed stage contracts | `lib/orchestra/types.ts` |
| Calendar (pure code) | `lib/orchestra/calendar.ts` |
| Strategy review + proposal application | `lib/orchestra/strategy.ts` |
| Background stage runner | `app/api/orchestra/campaign/route.ts` |
| Checkpoint actions | `lib/actions/campaign.ts` |
| UI | `app/company/studio/page.tsx` + `components/campaign-*.tsx`, `post-performance-panel.tsx`, `strategy-review-panel.tsx` |

## The rules that are enforced in code, not in prompts

- **A stage can't run twice.** `advanceStage` is a compare-and-swap on `stage`; the API route additionally dedupes in-process and treats a stage older than 12 minutes as dead.
- **A stage can't start itself.** Only `researching`, `deep_research`, and `drafting` are runnable; every other stage is a checkpoint waiting on a human.
- **`aiText` is frozen at draft time.** Every later change — the editor's or yours — is measurable against it.
- **Approval is the only path to the post queue.** `decideDraft` is the sole writer of campaign posts into `orchPosts`.
- **Proposals are additive.** `applyStrategyProposal` can append a line to memory; it can never rewrite or delete one.
- **Nothing is silently lost.** A draft that fails while its siblings succeed, a polish pass that throws, an audit that didn't run — each writes a line into `campaign.notes`, which the review screen shows above the drafts.

## Cost shape

One 2-post campaign on the Quality tier measured ≈ **$1.15** end to end (scout + rank + 2 briefs + hooks + 2 drafts + polish + audit + one revision). Roughly linear in post count from there, because the per-topic stages fan out and the cross-topic stages (hooks, polish, audit) stay at one call each regardless of size.

Everything goes through the same `ORCHESTRA_DAILY_CAP_USD` ledger cap as the daily run — a campaign and a daily run share one day's budget.

## Adding to the team

New employees go in `lib/orchestra/registry.ts` (add the id to `CODENAMES` too, so charters get themed) and get a charter `.txt`. Drop a `public/avatars/<role-id>.png` to give them a portrait; without one they render as an initial.

**When you write a charter, print the exact JSON envelope shape.** Describing it in prose ("then the standard envelope extended with `topics`") is how the first Radar scout run failed: the model returned a valid base envelope with the required array missing.
