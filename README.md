# Dayspring 🌅

Personal job-search command center. One tool that unifies the search across
role types (FDE / Frontend / Backend / Fullstack / Data): a pipeline tracker,
a job feed pulled from company ATS boards (Greenhouse / Lever / Ashby /
Workday), import bridges, Claude match scoring + tailoring, cited web-research
briefs, an Apollo cold-contact finder **and** a Happenstance warm-network
lane, LinkedIn-connections import, a Gmail outreach queue with reply
detection, a Gmail OTP reader, an encrypted credential vault, attended
apply-assist, and a scheduled daily run that emails a morning digest.

**Positioning:** optimize for *warmer* applications, not more of them.
Automate the prep; keep a human on the trigger — nothing sends itself, no
credit is spent without a click, and apply-assist is **attended only** (you
watch the browser, solve CAPTCHAs, and submit).

## Setup

```sh
nvm use              # Node 20 (see .nvmrc; machine default 18 is EOL)
npm install
cp .env.example .env.local   # Convex URL + CLI credentials (see below)
npm run db:push      # create SQLite schema in data/dayspring.db
npm run seed         # watched companies (Vercel, Mistral, Linear) + profile stub
npm run dev          # http://localhost:3000
```

Then, in the app: **Settings → paste your resume, targets, and API keys**
(each user brings their own keys; they are stored encrypted in your account).

If Node versions get switched later, rebuild the native SQLite bindings:
`npm rebuild better-sqlite3`.

### Keys (each feature stays off until you add it in Settings → API Keys)

| Key | Unlocks |
|---|---|
| Anthropic | match scoring, paste-parse, tailoring, outreach drafts, **research briefs** |
| Apollo (master key) | cold-contact search (free) + email reveal (1 credit each) |
| Happenstance (`hpn_…`) | **warm-network search** (2 credits) + person research (1 credit); free tier at happenstance.ai |
| Apify | **LinkedIn hiring posts** — the feed's second source (see below) |
| Google client ID + secret | paste in API Keys, then **Connect Gmail** in Settings |
| `DAYSPRING_VAULT_KEY` (host env only) | encrypts saved API keys and vault passwords — set on Vercel, not per-user |

For local CLI scripts only (`npm run seed`, `pull-jobs`, `daily`), you may
optionally set keys in `.env.local` when running unauthenticated. The web app
always uses keys from **Settings → API Keys**.

Gmail prereq: Google Cloud project → **enable the Gmail API in the API
Library** (separate from OAuth consent — if you skip it, every Gmail call
403s) → OAuth consent screen (External, testing mode, add yourself as test
user) → **Desktop app** OAuth client → paste both values → `npm run
gmail:auth` (one browser consent).

Apply-assist prereq: `npx playwright install chromium`, and set your resume
PDF path in Settings.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run db:push` / `db:studio` | schema / browse the DB |
| `npm run seed` | idempotent seed |
| `npm run pull-jobs` | pull ATS boards from the CLI |
| `npm run gmail:auth` | one-time Gmail OAuth (loopback flow) |
| `npm run daily` | full pipeline: pull → score (cap 50) → check replies → digest |
| `npm run apply -- <jobId>` | **attended** apply-assist: headed browser, autofill, human-gated submit |
| `npm run cron:install` / `cron:uninstall` | launchd agent, daily at 07:30 (missed runs fire on wake) |

## How it fits together

- `lib/db/schema.ts` — every table in one file (SQLite now, written to port to
  Supabase Postgres by swapping column-builder imports).
- `lib/integrations/` — hub-and-spoke: `ats/` (Greenhouse/Lever/Ashby),
  `apollo/` (people search + enrichment), `gmail/` (hand-rolled OAuth + REST),
  `linkedin/` (post search via Apify).
- `lib/jobs/`, `lib/outreach/`, `lib/digest.ts` — Next-free cores shared by the
  UI actions, `scripts/*.ts`, and the MCP server.
- `lib/claude/` — scoring (Sonnet), paste-parse + title classification (Haiku),
  tailoring + outreach drafts (Opus). Server-side only; hard never-fabricate
  rules in every prompt.
- `scripts/mcp-server.ts` + `.mcp.json` — drive Dayspring by chatting with
  Claude (Claude Code auto-discovers it in this repo). Tools can pull, score,
  query, and draft — deliberately **cannot** send outreach or spend credits.

## The feed's two sources

**Boards** (`/feed`) — the original pull: every watched company's ATS board
(Greenhouse / Lever / Ashby / Workday) plus Adzuna for the long tail.

**LinkedIn posts** (`/feed/posts`) — posts where someone announces an open
role, which is often where a job surfaces days before it reaches a board. Each
post is shown in full with its permalink and, when the post contained one, a
direct **job link**. `Add` promotes a post into the pipeline as a wishlist row.

LinkedIn publishes no post-search API, so this source runs through an Apify
actor (`harvestapi/linkedin-post-search` by default — keyword search, no
LinkedIn cookie or account required) — a third-party scraper, billed per post,
and scraping LinkedIn can violate its terms. It is off until you save an
**Apify** token, and nothing about the boards pull depends on it. Swap the actor
with `LINKEDIN_POSTS_ACTOR`; tune reach with `LINKEDIN_POSTS_MAX_DAYS` /
`LINKEDIN_POSTS_PER_QUERY`.

Search terms are editable on the tab (defaults derive from your onboarding role
types), and each term is one paid run, so up to 8 are used. A cheap model call
then decides whether each post is really a job announcement, and pulls out the
company, titles, location, and apply link. That link is only ever chosen from
URLs actually present in the post text — never generated — so a post with no
link says so instead of pointing you somewhere invented. Non-hiring posts are
filed as ignored rather than deleted, so later pulls skip them for free.

Automation: `npm run daily` includes the post search. Hosted deployments can't
run it inside Convex (the Apify token is sealed with `DAYSPRING_VAULT_KEY`,
which only the Next process holds), so point Vercel Cron at
`GET /api/cron/linkedin` with `Authorization: Bearer $CRON_SECRET`.

**Retention:** nothing older than **15 days** (`postedAt`, else `createdAt`) is
kept anywhere in the portal — feed, board, apply queue, or LinkedIn posts.
Stale rows are cascade-deleted daily by a Convex cron (and again at the start
of `npm run daily`); reads and ingest also refuse anything past that ceiling.

## Warm network (Happenstance + LinkedIn)

The referral lane: `/network` and every company page search your **own**
connections in natural language (Happenstance API, credit-labeled). Import
your LinkedIn `Connections.csv` (Import page) to seed the same graph for free —
contacts match to tracked companies automatically. Research briefs (a button on
any job/company) run Claude web-search into a cited brief that's threaded into
tailoring + outreach so your materials cite real, current specifics.

## Apply-assist (attended — the risk boundary)

`npm run apply -- <jobId>` opens a **headed browser you watch**. It autofills
name/email/phone/links + résumé + cover letter from your profile and tailored
materials, then **hard-stops**: you solve any CAPTCHA, review, and *you* submit
(type `submitted` to record it). It never auto-submits, never answers EEO/
demographic questions, runs one job at a time, and requires a one-time
`I accept the risk for <host>` acknowledgement per site. Automating ATS forms
can violate site terms; this is a deliberate, human-gated opt-in — not
unattended spray.

- **Credential vault** (`DAYSPRING_VAULT_KEY`): one master password, AES-256-GCM
  at rest, reused for job-site accounts. Settings → set master + view accounts.
- **Gmail OTP**: verification codes surface on the dashboard; apply-assist
  auto-reads Workday signup codes from Gmail.
- **Workday** needs three values, not a slug — from a careers URL like
  `https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite`: tenant
  `nvidia`, datacenter `wd5`, site `NVIDIAExternalCareerSite` (Company form →
  Workday details).

## Cost controls

Scoring: manual or daily-capped (50/run, ~$0.02–0.03/job), thin-JD skip,
profile prompt cached. Tailoring ~$0.10–0.25/job, outreach ~$0.03–0.08,
research briefs ~$0.03–0.10 (Sonnet) / ~$0.15–0.40 (Opus deep) — all
user-triggered. Apollo cold-search is free (reveal = 1 credit/click);
Happenstance = 2 credits/search, 1/research, confirm-gated. The daily run
never sends outreach, never enriches, never applies.

## Status

Full original blueprint (tracker · feed + imports · scoring · Apollo · outreach
+ Gmail · follow-ups + digest · daily run · MCP) **plus pass-3**: Happenstance
warm-network, LinkedIn import, research briefs, Gmail OTP, credential vault, and
attended apply-assist (Greenhouse/Lever/Ashby + Workday sourcing & signup). 14
MCP tools. Next candidates: Supabase port for off-laptop cron, Batches API for
overnight scoring.
