# Dayspring 🌅

Personal job-search command center. One tool that unifies the search across
role types (FDE / Frontend / Backend / Fullstack / Data): a pipeline tracker,
a job feed pulled from company ATS boards, import bridges, Claude match
scoring + tailoring, an Apollo contact finder, a Gmail outreach queue with
reply detection, and a scheduled daily run that emails a morning digest.

**Positioning:** optimize for *warmer* applications, not more of them.
Automate the prep; keep a human on the trigger — nothing sends itself and
no Apollo credit is spent without a click.

## Setup

```sh
nvm use              # Node 20 (see .nvmrc; machine default 18 is EOL)
npm install
cp .env.example .env.local   # then fill in the keys below
npm run db:push      # create SQLite schema in data/dayspring.db
npm run seed         # watched companies (Vercel, Mistral, Linear) + profile stub
npm run dev          # http://localhost:3000
```

Then, in the app: **Settings → paste your resume + targets** (everything
Claude does is grounded in that text).

If Node versions get switched later, rebuild the native SQLite bindings:
`npm rebuild better-sqlite3`.

### Keys (each feature stays off until its key exists)

| Env var | Unlocks |
|---|---|
| `ANTHROPIC_API_KEY` | match scoring, paste-parse, tailoring, outreach drafts |
| `APOLLO_API_KEY` (master key) | contact search (free) + email reveal (1 credit each) |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, then `npm run gmail:auth` | Gmail send, reply detection, emailed digest |

Gmail prereq: Google Cloud project → enable Gmail API → OAuth consent screen
(External, testing mode, add yourself as test user) → **Desktop app** OAuth
client → paste both values → `npm run gmail:auth` (one browser consent).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run db:push` / `db:studio` | schema / browse the DB |
| `npm run seed` | idempotent seed |
| `npm run pull-jobs` | pull ATS boards from the CLI |
| `npm run gmail:auth` | one-time Gmail OAuth (loopback flow) |
| `npm run daily` | full pipeline: pull → score (cap 50) → check replies → digest |
| `npm run cron:install` / `cron:uninstall` | launchd agent, daily at 07:30 (missed runs fire on wake) |

## How it fits together

- `lib/db/schema.ts` — every table in one file (SQLite now, written to port to
  Supabase Postgres by swapping column-builder imports).
- `lib/integrations/` — hub-and-spoke: `ats/` (Greenhouse/Lever/Ashby),
  `apollo/` (people search + enrichment), `gmail/` (hand-rolled OAuth + REST).
- `lib/jobs/`, `lib/outreach/`, `lib/digest.ts` — Next-free cores shared by the
  UI actions, `scripts/*.ts`, and the MCP server.
- `lib/claude/` — scoring (Sonnet), paste-parse + title classification (Haiku),
  tailoring + outreach drafts (Opus). Server-side only; hard never-fabricate
  rules in every prompt.
- `scripts/mcp-server.ts` + `.mcp.json` — drive Dayspring by chatting with
  Claude (Claude Code auto-discovers it in this repo). Tools can pull, score,
  query, and draft — deliberately **cannot** send outreach or spend credits.

## Cost controls

Scoring: manual or daily-capped (50/run, ~$0.02–0.03/job), thin-JD skip,
profile prompt cached. Tailoring ~$0.10–0.25/job and outreach drafts
~$0.03–0.08 — Opus, always user-triggered. Apollo search is credit-free;
email reveal is an explicit per-contact click. The daily run never sends
outreach and never enriches.

## Blueprint status

1–7 all built: tracker · feed + imports · scoring · Apollo contacts ·
outreach + Gmail · follow-up engine + digest · scheduled daily run — plus the
MCP layer. Next candidates: Supabase port for off-laptop cron, Batches API
for overnight scoring, LinkedIn-channel outreach tracking.
