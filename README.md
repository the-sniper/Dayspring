# Dayspring 🌅

Personal job-search command center. One tool that unifies the search across
role types (FDE / Frontend / Backend / Fullstack / Data): a pipeline tracker,
a job feed pulled from company ATS boards, import bridges for closed products,
and Claude-powered match scoring.

**Positioning:** optimize for *warmer* applications, not more of them.
Automate the prep; keep a human on the trigger.

## Setup

```sh
nvm use              # Node 20 (see .nvmrc; machine default 18 is EOL)
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for scoring/parsing
npm run db:push      # create SQLite schema in data/dayspring.db
npm run seed         # watched companies (Vercel, Mistral, Linear) + profile stub
npm run dev          # http://localhost:3000
```

If Node versions get switched later, rebuild the native SQLite bindings:
`npm rebuild better-sqlite3`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run db:push` | push Drizzle schema to SQLite |
| `npm run db:studio` | browse the DB |
| `npm run seed` | idempotent seed (companies + profile placeholder) |
| `npm run pull-jobs` | pull ATS boards from the CLI — future cron entry point |

## How it fits together

- `lib/db/schema.ts` — every table in one file (SQLite now, written to port to
  Supabase Postgres by swapping column-builder imports).
- `lib/integrations/ats/` — Greenhouse / Lever / Ashby board adapters behind one
  interface. Apollo + Gmail integrations land here later (hub-and-spoke seam).
- `lib/jobs/pull.ts` — Next-free pull core shared by the UI button and
  `scripts/pull-jobs.ts`.
- `lib/claude/` — scoring, paste-parsing, role classification. Server-side only.
- `lib/actions/` — thin `'use server'` wrappers; all logic lives in `lib/` so a
  future MCP layer / cron can call it directly.

## Cost controls

Scoring is manual-trigger only (never auto on pull), capped at 25 jobs per
click, skips thin JDs, caches the profile prompt during batches, and surfaces
token counts after every run. Roughly $0.02–0.03 per scored job.
A future lever: the Batches API halves cost if scoring moves to overnight cron.

## Roadmap (from the blueprint)

1. Tracker + data model *(this build)* · 2. Job feed + import bridges *(this
build)* · 3. Claude match scoring *(this build)* · 4. Apollo contact finder ·
5. Outreach queue + Gmail send · 6. Follow-up engine + morning digest ·
7. Scheduled daily run · 8. MCP server layer
