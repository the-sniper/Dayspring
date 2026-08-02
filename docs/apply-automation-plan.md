# Apply automation: the four lanes

Written against the Dayspring source as of Aug 2, 2026. Every file path,
function name, and behavior claim below was read out of the repo, not assumed.

## The constraint that shapes everything

No ATS exposes a candidate-side submit API. All four of the big ones have a
submission endpoint, and all four gate it behind the *employer's* key:

| ATS | Endpoint | Auth |
|---|---|---|
| Greenhouse | `POST /v1/boards/{token}/jobs/{id}` | Basic auth, board API key. The only authenticated endpoint on an otherwise public API. |
| SmartRecruiters | `POST /postings/{uuid}/candidates` | `X-SmartToken`. Docs state candidates do not submit through it. |
| Ashby | `applicationForm.submit` | Requires `candidatesWrite` on the org's key. |
| Workday | none published | Account-based only. |

The Anthropic connector directory says the same thing from the other side. It
lists Ashby, Workable, and Metaview, and every one is recruiter-facing
(`get_candidates`, `move_candidate`, `disqualify_candidate`). The only
candidate-facing entry is ZipRecruiter, and it exposes `search_jobs` and
nothing else.

So MCP is not going to be the thing that submits. Browser automation stays the
only path for form-based applications, which is what `lib/apply/` already is.
The four lanes below make that path better, plus open the one lane where a
machine can legitimately finish an application end to end.

---

## Lane A: give the browser a real logged-in session

This is the highest value per line of code in the whole plan, and it is
smaller than it looks.

### What is happening now

`runToReview` in `lib/apply/session.ts` already asks for the real Chrome
binary:

```ts
s.browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
```

But `launch` creates a **fresh, empty profile**. Real Chrome binary, zero
cookies. That single fact is the root cause of a surprising amount of the
codebase:

- `lib/vault/core.ts` plus `lib/vault/crypto.ts`, the AES-256-GCM credential vault
- `lib/apply/workday-signup.ts` and `lib/gmail/otp.ts`, the OTP reader
- `vaultWorkdayAccount()` and `readOtp()` in `session.ts`
- The entire `if (s.state.ats === "workday")` branch, which **skips autofill
  completely** and hands the form to you with helper buttons

Workday is currently 100% manual in Dayspring. Given that most large-company
postings live on Workday, that is the biggest gap in the product, and it exists
because the browser shows up logged out.

### The fix, in order of effort

**A1. Persistent profile (about 20 lines).** Swap `chromium.launch` for
`chromium.launchPersistentContext` against a dedicated Dayspring profile
directory:

```ts
const ctx = await chromium.launchPersistentContext(profileDir, {
  channel: "chrome",
  headless: embedded,
  args: ["--disable-blink-features=AutomationControlled"],
  ignoreDefaultArgs: ["--enable-automation"],
  locale: "en-US",
  timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
});
s.page = ctx.pages()[0] ?? await ctx.newPage();
```

You sign into each Workday tenant once, by hand, in that profile. It sticks.
Every subsequent application to that tenant walks in already authenticated.
Note that `launchPersistentContext` returns a `BrowserContext`, not a
`Browser`, so `ActiveSession.browser` and `browserAlive()` need their types
widened, and `closeBrowser` calls `ctx.close()`.

**A2. Attach to your actual Chrome (a bit more effort).** Launch your day-to-day
Chrome with `--remote-debugging-port=9222` and use
`chromium.connectOverCDP("http://localhost:9222")`. You get your real session
with every login you already have, including LinkedIn. Tradeoff: automation is
now driving the browser you are also using, so a stray click during a fill pass
lands in the form. A1 is the safer default; A2 is the escape hatch when a site
refuses a fresh profile.

**Both A1 and A2 keep 100% of `lib/apply/ats-forms.ts`.** That matters. There
is real, hard-won knowledge in that file: the `fillSticky` retype-on-reset
workaround for Greenhouse's new React board, `formScope` iframe resolution,
`tryComboSelect` for react-select widgets, the post-settle verification pass.
None of it transfers to a different automation driver.

**A3. Claude in Chrome MCP as a third lane, not a replacement.** I overstated
this in the initial brainstorm. Routing everything through the Chrome MCP would
throw away `ats-forms.ts`. The honest scope for it is narrow: sites where the
Playwright selector layer fails outright and you want a vision-driven fallback.
Worth having eventually. Not worth having before A1.

### What A1 unlocks

Once Workday sessions persist, delete the special case in `runToReview` and let
Workday go through `fillCommonForm` like every other board. The vault and OTP
machinery become a fallback for first-time signups rather than the main path.
That is a net *reduction* in surface area while adding the biggest missing
capability.

---

## Lane B: turn the apply session into an MCP loop

### The weakness this fixes

`aiFillRemaining` in `lib/apply/ai-fill.ts` is a single structured call. It
serializes at most 25 empty fields, gets one `Mapping` back, and calls
`writeField` on each. When `writeField` returns `false`, which happens whenever
`tryComboSelect` finds no matching option or a `select` value is not verbatim
in `field.options`, **nothing retries and nothing reports it**. The field is
silently still empty at the review gate. That is exactly the manual cleanup
you are doing today.

Multi-page forms have the same problem from the other direction. There is no
concept of advancing a wizard, so page two of a Workday application is never
seen.

### The architectural gotcha

The apply session is a singleton on `globalThis` inside the Next process:

```ts
const g = globalThis as typeof globalThis & { __dsApplySession?: ActiveSession | null };
```

The MCP server is a **separate stdio process** (`npx tsx scripts/mcp-server.ts`
per `.mcp.json`). It cannot touch that singleton. So MCP apply tools have to go
over HTTP to the running app. You already have the shape for this:
`app/api/apply/state/route.ts`, `app/api/apply/frame/route.ts`, and
`app/api/apply/input/route.ts`. Add `snapshot`, `fill`, and `advance` routes
next to them and the MCP tools become thin HTTP clients.

### The tools

Most of the work already exists as functions. Exposing them is the job.

| Tool | Backed by | New code |
|---|---|---|
| `apply_open` | `startSession()` | route only |
| `apply_state` | `getSessionState()` | already routed |
| `apply_snapshot` | `serializeEmptyFields()` + `captureFormAnswers()` | export `serializeEmptyFields` from `ai-fill.ts`, merge the two views |
| `apply_fill_field` | `writeField()` in `ai-fill.ts` | export it, add a route |
| `apply_advance` | new | click next/continue, wait for form ready, re-snapshot |
| `apply_skip_fill` | `skipFill()` | route only |
| `apply_cancel` | `cancelSession()` | route only |

With `snapshot` and `fill_field` as separate tools, the MCP client becomes the
loop. It fills, re-snapshots, sees what did not stick, and tries a different
option string. `aiFillRemaining` stays as the fast path for the common case;
the loop is what you reach for when a form fights back.

### Where the boundary goes

Your README states the line clearly: "Tools can pull, score, query, and draft,
deliberately **cannot** send outreach or spend credits."

**Recommendation: do not expose `approveAndSubmit` over MCP.** Expose
everything up to `awaiting_review` and stop. The submit click stays a UI
action, which keeps the existing boundary intact and keeps `bankAnswersOnApproval`
firing on a real human decision. The loop is about filling the form well, not
about who clicks the button.

---

## Lane C: make the answer bank actually hit

### Two problems, one of them a bug

`normalizeQuestion` in `lib/apply/answers.ts` lowercases, strips punctuation and
required-markers, collapses whitespace, and caps at 160 chars. `loadSavedAnswers`
then does exact `Map.get`. So:

- "Why are you interested in this role?" and "What draws you to this position?"
  are different keys, and the second one costs a model call. That is the
  **coverage problem**.
- More seriously: `isBankableQuestion` only rejects contact fields and EEO. A
  company-agnostic essay question like "Why are you interested in this role?"
  gets banked and then **replayed verbatim at the next company**. Company-named
  variants ("Why do you want to work at Vercel?") are accidentally safe because
  the name is in the key, but the generic phrasing is not. That is a
  **correctness bug** and it should be fixed regardless of the rest of this lane.

### Fix the bug first

Add a reusability classification at bank time. Short factual answers (notice
period, years of experience, salary expectation, authorization) are reusable.
Anything that is an opinion about a specific employer is not. Cheapest version:
a length plus shape heuristic (under ~120 chars and not matching
`/why|interest|excit|draw|passion|tell us about/i`) marks reusable, everything
else banks as reference-only and shows in the UI without auto-filling. Better
version: have the cheap model tag it at bank time, in the same call budget you
are already spending.

This needs a `reusable: boolean` column on `applyAnswers` (schema is
`convex/schema.ts`, mutation is `convex/applyAnswers.ts:upsert`).

### Then fix coverage

Two options, and I would do the first.

**C1. Question classes.** At bank time, classify into a small closed enum:
`sponsorship`, `work_authorization`, `relocation`, `notice_period`,
`salary_expectation`, `years_experience`, `referral_source`, `previously_employed`,
`clearance`, `other`. Match on class rather than string. Class hits are exact,
explainable in the review summary ("answered from your saved *sponsorship*
answer"), and they compose cleanly with `ApplicationDefaults`, which already
covers several of these deterministically in `fillCommonForm`. Only `other`
falls through to the AI pass.

**C2. Embeddings.** Store a vector per banked question, cosine-match incoming
labels above a threshold around 0.88. More coverage on the long tail, but a
fuzzy match that fires wrong is worse than a miss, because it fills a field with
a confidently wrong answer that you then have to catch at review.

C1 first. Add C2 later for the `other` bucket only, if the miss rate justifies it.

### The target

Right now `fillCommonForm` handles contact fields plus whatever
`ApplicationDefaults` covers, and everything else lands on the model. The goal
is the model touching two or three genuinely novel questions per application
instead of fifteen. Every class hit is a skipped model call and a deterministic,
auditable fill.

---

## Lane D: the email-apply lane

The one path where a machine can legitimately complete an application. No ToS
gray area, no CAPTCHA, no form.

### What is missing

**D1. `sendEmail` cannot attach files.** `buildMime` in
`lib/integrations/gmail/client.ts` builds a single-part `text/plain` message:

```ts
'Content-Type: text/plain; charset="UTF-8"',
```

An email application needs the resume PDF attached. This needs a
`multipart/mixed` builder with a base64 part for the PDF. Maybe 40 lines,
entirely self-contained, and it does not disturb the existing outreach send
path if you keep `buildMime` and add `buildMimeWithAttachments` alongside it.

**D2. `sendOutreach` is the wrong entry point.** It requires a `contactId` with
a revealed email, and it enforces `HUMAN_EDIT_FLOOR_PCT` against a frozen
`aiDraft`. An email application goes to a mailbox (`jobs@`, `careers@`), not to
a person in the contacts table. It needs a sibling function, not a modification:
`sendApplicationEmail(jobId)` that pulls from `loadApplyContext` (which already
resolves the tailored resume PDF via `resumePdfForJob` and the cover letter).

**D3. Detecting the lane.** Postings qualify when the JD contains a `mailto:` or
a bare email address and there is no ATS form URL. `lib/reach/extract-domains.ts`
is the closest existing thing to build on. This is a per-job flag set at pull
time.

### Keep the edit floor

The `HUMAN_EDIT_FLOOR_PCT` idea should carry over. An email application is a
cover letter with a resume stapled to it, and a fully machine-written one is
exactly the low-signal artifact your positioning line argues against. Same gate:
you rewrite enough of it before it goes.

---

## Build order

1. **A1, persistent profile.** Smallest change, biggest unlock, and it retires
   code rather than adding it. Test against one Workday tenant end to end before
   deleting the special-case branch.
2. **C bug fix.** The verbatim-essay-replay issue is live right now and
   independent of everything else.
3. **C1, question classes.** Compounds with A1, since Workday forms are long and
   question-heavy.
4. **D1 plus D2, email lane.** Self-contained, unblocked by anything above.
5. **B, MCP loop.** Do this last. It is the most code, it needs the HTTP
   transport decision made, and A1 plus C1 will have already removed a chunk of
   the failures the loop exists to recover from.

A note on B and hosting: `.mcp.json` runs the server over stdio with a hardcoded
nvm path, so today Dayspring's MCP only works from Claude Code inside that repo.
If you want to drive applications from Cowork or your phone, the server needs a
Streamable HTTP transport. You shipped exactly that at Carmel Labs, so it is a
short job, and it is a prerequisite for B being useful anywhere but your laptop.

## What not to build

Unattended submit. The tools that do it are a meaningful part of why companies
are adding application-volume defenses, and your own positioning line already
makes the argument: optimize for warmer applications, not more of them. Every
lane above makes the prep faster. None of them should move the trigger.
