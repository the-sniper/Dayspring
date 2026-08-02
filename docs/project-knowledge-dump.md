# Project Knowledge Dump

Evidence-only extraction from local codebases. Claims are sourced from files, configs, or git history. Unverifiable items are marked `UNKNOWN — ask Areef`. Code was read before READMEs; mismatches are noted.

**Last full scan:** 2026-08-02 (initial). **Re-run:** 2026-08-02 after Dayspring commit `fa415bd` (LaTeX/Connect/MCP apply). Sibling repos unchanged since initial scan — only Dayspring section refreshed.

**Repos scanned:** `Code/Dayspring`, `Code/Klyro`, `Code/hound`, `Code/grit`, `Code/portfolio`, `Code/career-ops`, `Code/job-scraper`, `Code/Old/{ecomedai,fact-checker,forecast_my_park,gesturepro}`, `Code/NoteOrg/echo_test` (AirLog), `Code/NoteOrg/Collidascope/airlog-base`, `Code/ESM Tool/{Backend,Client}`, `Misc/Django/poolside` (Conduit).

---

## Project: Dayspring

- **One-line pitch:** Personal job-search command center that unifies ATS/LinkedIn intake, match scoring, resume tailoring (React-PDF + LaTeX), warm/cold outreach, attended apply automation, and a multi-agent “company” orchestra—automate prep, keep a human on the trigger (`README.md`; `components/nav.tsx`).
- **Status & dates:** Active solo build; first commit `2026-07-05`, latest HEAD `2026-08-02` (`fa415bd`); **51 commits**, sole author **Areef Syed**; package `dayspring` `0.1.0` private. Working tree clean on `main` at re-run time. README “Status” claims blueprint + pass-3 + pass-4 (21 MCP tools) — **reconcile:** README still documents SQLite/`npm run db:push`/`lib/db/schema.ts` while code/backend is Convex (`convex/schema.ts`; no `db:*` scripts; no `better-sqlite3` in `package.json`; `lib/db` absent). README Status does **not** mention the LaTeX Fly/k8s sidecar.
- **Links:** Repo `https://github.com/the-sniper/Dayspring.git`. Fly app name `dayspring-latex`, region `iad` (`services/latex/fly.toml`). Optional k8s + KEDA manifests (`services/latex/k8s/{deployment,keda,kind}.yaml`). Hosted deploy implied by `VERCEL` / `DAYSPRING_HOSTED` (`lib/hosted.ts`, `.env.example`). Live prod URL / whether latex sidecar is deployed: `UNKNOWN — ask Areef`.

**Delta since prior dump (commit `fa415bd`, ~6.5k insertions / 62 files):** Prior dump described much of this from a dirty working tree; HEAD now **commits** that surface. Net new vs prior *committed* parent: LaTeX pipeline end-to-end (Protobuf + Buf + ConnectRPC client + Fly/k8s tectonic sidecar + UI + `resumeAssets` + `generatedResumes` latex fields), MCP apply HTTP bridge (`app/api/apply/agent`), apply stack (`answer-class`, `browser`, `email-apply`, session growth), MCP tools **14→21**, deps `@bufbuild/*` + `@connectrpc/*`, script `proto`, `.env.example` LaTeX/`DAYSPRING_AGENT_SECRET` blocks. Git: **50→51** commits; last date **2026-08-01→2026-08-02**. Corrected `defineTable` count to **24** (+ `authTables`), not 25. Orchestra unchanged: **12 active / 1 planned**.

### Purpose & problem
Dayspring optimizes for *warmer* applications, not volume: pull roles from company ATS boards + LinkedIn hiring posts + Adzuna; score/tailor materials (structured React-PDF path **and** LaTeX path with compiler-verified page count); research with citations; find cold (Apollo) and warm (Happenstance + LinkedIn Connections CSV) contacts; draft outreach with Gmail send/reply detection under a human-edit floor; assist applications in a headed browser without auto-submit; run a daily digest; and operate an agent orchestra with immutable task contracts and budget hard-stops (`README.md`; `convex/schema.ts`; `lib/orchestra/run.ts`; `lib/resumes/latex-core.ts`).

### Tech stack (be exhaustive and specific)
- **Languages / runtime:** TypeScript `^5.8.3`; Node `>=20` (`.nvmrc` = `20`); JS in `services/latex/server.js`; Protobuf IDL (`proto/dayspring/latex/v1/latex.proto`)
- **App:** Next.js `^15.3.3` (Turbopack dev), React `^19.1.0`, Tailwind CSS v4 (`^4.1.8`), HeroUI v3, Framer Motion, Lucide, Zod `^4.4.3`, `clsx` / `tailwind-merge` / `tailwind-variants`
- **Backend / data:** Convex `^1.42.1` + `@convex-dev/auth` `^0.0.94` + `@auth/core`; Convex File Storage for resume PDFs; migrated from earlier SQLite/Drizzle (git history; README still stale)
- **Auth:** Password + Google providers (`convex/auth.ts`); middleware via `@convex-dev/auth/nextjs` (`middleware.ts`)
- **AI:** `@anthropic-ai/sdk` — `MODEL_SCORE=claude-sonnet-5`, `MODEL_CHEAP=claude-haiku-4-5`, `MODEL_PREMIUM=claude-opus-4-8` (`lib/claude/client.ts`); orchestra tiers also reference `claude-opus-5`; optional OpenAI path (`openai` `^6.46.0`, `lib/ai/openai.ts`, `lib/ai/complete.ts`)
- **Browser automation:** Playwright `^1.61.1` (devDependency; `serverExternalPackages` in `next.config.ts`)
- **Documents:** `@react-pdf/renderer`, `react-pdf`, `pdfjs-dist`, `docx`; **LaTeX** via Claude rewrite + compile sidecar or local TeX (`lib/claude/latex-resume.ts`, `lib/resumes/latex*.ts`, `services/latex/`)
- **RPC / IDL:** Protobuf + Buf (`buf.yaml`, `buf.gen.yaml`, `npm run proto`); `@bufbuild/protobuf` `2.13.0`, `@connectrpc/connect` / `@connectrpc/connect-node` `2.1.2`; `@bufbuild/buf` / `@bufbuild/protoc-gen-es` (dev); generated stubs under `shared/gen/`
- **Integrations:** Greenhouse / Lever / Ashby / Workday ATS; Adzuna; Apify LinkedIn posts; Apollo; Happenstance; Gmail OAuth REST; MCP (`@modelcontextprotocol/sdk` `^1.29.0`, `scripts/mcp-server.ts`, `.mcp.json`)
- **Security:** AES-256-GCM vault (`lib/vault/crypto.ts`); `CRON_SECRET` / `DAYSPRING_AGENT_SECRET` / `DAYSPRING_LATEX_SERVICE_SECRET` (+ service `LATEX_SERVICE_SECRET`)
- **Infra:** Convex crons (`convex/crons.ts`); Vercel cron routes (`app/api/cron/*`); Fly.io LaTeX (`services/latex/fly.toml` — 512MB, 1 shared CPU, `min_machines_running=0`); **Kubernetes + KEDA** manifests as alternate scale-to-zero target (`services/latex/k8s/*`); local launchd (`scripts/cron-install.sh`). No `.github/workflows` found.

### Architecture
- UI (`app/*`, `components/*`) → Server Actions (`lib/actions/*`) → Next-free cores (`lib/jobs`, `lib/apply`, `lib/outreach`, `lib/orchestra`, `lib/resumes`, …) → Convex + external APIs. CLI/MCP/cron reuse the same cores.
- Multi-user tenancy via `userId` on app tables; public exceptions for `/signin`, `/api/auth`, `/api/cron`, `/api/apply/agent` (`middleware.ts`) — agent route is cookie-public but Bearer-secret-gated.
- Job intake hub-and-spoke: ATS concurrency 10, chunked Convex upserts, max 500 new jobs/pull; LinkedIn max 300 posts/pull; JD text in side-table `jobDescriptions` (`lib/jobs/pull.ts`, `lib/linkedin/pull.ts`, `convex/schema.ts`).
- **LaTeX path:** Settings stores `latex_template` + `knowledge_base` in `resumeAssets` → job page triggers generate → Claude rewrites `.tex` → `compileLatex` (remote Connect/gRPC/gRPC-Web or local tectonic/pdflatex/xelatex/lualatex) → real `pages` → optional one repair pass → store in `generatedResumes` with `format: "latex"` (`lib/resumes/latex-core.ts`, `lib/resumes/latex-client.ts`, `services/latex/server.js`).
- Apply: Playwright session singleton (`lib/apply/session.ts` ~720 LOC); human-gated submit; MCP fill via `/api/apply/agent` cannot submit; email-apply is the only full machine path (`lib/apply/email-apply.ts`) with `HUMAN_EDIT_FLOOR_PCT = 60`.
- Orchestra: registry → daily `runOrchestra` (~997 LOC); Ledger hard-cap default **$5/day**; immutable `orchTasks` contracts.
- Deploy split: Convex holds data/public ATS pull; sealed API keys only unsealable in Next → hosted LinkedIn/orchestra via secret-gated API routes; LaTeX compile offloaded to Fly/k8s sidecar so hosted users need no TeX.

### What was actually built (feature inventory)
- Auth (email/password + Google) + onboarding gate — `convex/auth.ts`, `app/onboarding/page.tsx`, `components/onboarding-gate.tsx`
- Dashboard / OTP widget / API usage panel — `app/page.tsx`, `components/verification-codes.tsx`, `components/api-usage-panel.tsx`
- Companies CRUD + watched ATS + Apollo headcount — `app/companies/*`, `convex/companies.ts`
- Curated catalog **136** companies (71 Greenhouse / 56 Ashby / 9 Lever) — `shared/company-catalog.json`
- Job pipeline + kanban board — `lib/types.ts` statuses, `app/board/page.tsx`, `stageEvents` / `applications` tables
- ATS pull GH/Lever/Ashby/Workday + Adzuna — `lib/integrations/ats/*`, `lib/jobs/pull.ts`
- LinkedIn hiring posts feed + promote-to-job — `lib/linkedin/*`, `app/feed/posts/page.tsx`
- US-location affirmative filter — `shared/us-location.ts`
- Import CSV + Claude paste-parse + LinkedIn Connections CSV — `lib/imports/*`, `app/import/page.tsx`
- Match scoring + profile studio + application defaults — `lib/jobs/score.ts`, `app/profile/page.tsx`
- Master/generated resumes; React-PDF + DOCX path — `lib/resumes/*`, `app/api/resumes/[id]/route.ts`, `app/api/docx/route.ts`
- **LaTeX resume path:** template + knowledge base assets, Claude tailor + length repair, Connect compile client, Fly/k8s tectonic sidecar, Settings + job UI — `convex/resumeAssets.ts`, `lib/resumes/latex.ts` / `latex-core.ts` / `latex-client.ts`, `lib/claude/latex-resume.ts`, `lib/actions/latex-resume.ts`, `components/resume-sources-panel.tsx`, `components/latex-resume-section.tsx`, `services/latex/*`, `proto/dayspring/latex/v1/latex.proto`
- Research briefs (cited) — `lib/research/core.ts`, `researchBriefs` table
- Apollo cold contacts + Happenstance warm network — `app/network/page.tsx`, `lib/integrations/{apollo,happenstance}/*`
- Outreach queue / 3-touch cadence / reply detection / human-edit floor — `lib/outreach/*`, `shared/outreach-rules.ts`
- Gmail send + OTP reader — `lib/integrations/gmail/*`, `lib/gmail/otp.ts`
- Credential vault + site accounts UI — `lib/vault/*`, `components/vault-panel.tsx`
- Attended apply-assist (Playwright) + answer bank (**13** meaning classes) — `lib/apply/*`, `applyAnswers` table, `lib/apply/answer-class.ts`
- Email-apply lane — `lib/apply/email-apply.ts`
- MCP server (**21** tools) + apply agent HTTP bridge — `scripts/mcp-server.ts`, `app/api/apply/agent/route.ts`, `.mcp.json`
- Daily run + digest + launchd — `scripts/daily.ts`, `lib/digest.ts`
- Agent orchestra + company pages + content approval + spend ledger — `lib/orchestra/*`, `app/company/*`, `orch*` tables; spend reset hint UI — `components/spend-reset-hint.tsx`
- Reach workspace — `app/reach/page.tsx`, `lib/reach/*`
- Role taxonomy (**15** types) — `shared/role-types.ts`
- 15-day job retention hard-cap — `shared/job-retention.ts`, `convex/crons.ts`
- Sanity check scripts — `scripts/check-apply-logic.ts`, `check-latex-resume.ts`, `check-us-location.ts`, `triage-us.ts`

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits / author | **51** / Areef Syed only | `git` |
| Date span (committed) | 2026-07-05 → **2026-08-02** | `git log` |
| App TS/JS LOC (excl. `_generated`) | **47,731** | walk: app 4803, components 16858, lib 18270, convex 4912, scripts 1643, shared 1068 (incl. gen), services 177 |
| `page.tsx` / `route.ts` | 21 / 11 | `find app` |
| Convex `defineTable` app entities | **24** (+ `authTables`) | `convex/schema.ts` |
| MCP tools | 21 | `registerTool` count in `scripts/mcp-server.ts` |
| Catalog companies | 136 (71 GH / 56 Ashby / 9 Lever) | `shared/company-catalog.json` |
| Role types / answer classes | 15 / 13 | `shared/role-types.ts`, `lib/apply/answer-class.ts` |
| Orchestra employees | 13 total (12 `active`, 1 `planned` = pulse) | `lib/orchestra/registry.ts` |
| Orchestra daily cap default | $5 USD | `lib/orchestra/ledger.ts` |
| Outreach rules | max 3 touches; 60% human-edit floor | `shared/outreach-rules.ts` |
| Pull caps | ATS concurrency 10; max 500 jobs/pull; LinkedIn max 300 posts/pull | `lib/jobs/pull.ts`, `lib/linkedin/pull.ts` |
| Retention | 15 days | `shared/job-retention.ts` |
| Largest modules | `lib/orchestra/run.ts` ~997 LOC; `lib/apply/session.ts` ~720 LOC | `wc -l` |
| Automated tests / GH Actions | 0 / 0 | find |
| Fly LaTeX VM | 512mb, 1 shared CPU, `min_machines_running=0`, health `/health` | `services/latex/fly.toml` |
| LaTeX service interface | `LatexService.Compile` + `Health`; Connect (default) / gRPC / gRPC-Web | `latex.proto`, `services/latex/README.md` |
| k8s latex manifests | deployment + KEDA + kind | `services/latex/k8s/` |
| `fa415bd` diff size | +6475 / −269 across 62 files | `git show --stat` |

### Engineering challenges & solutions
1. **Convex write/read limits** — chunked/paced upserts + retries; JD side-table (`lib/jobs/pull.ts`, `convex/schema.ts`).
2. **React ATS forms discarding fill** — `fillSticky` verify-after-blur + keystroke fallback; iframe `formScope` (`lib/apply/ats-forms.ts`).
3. **Workday session walls** — persistent Chrome profile / CDP attach (`lib/apply/browser.ts`).
4. **No candidate-side ATS submit API** — human-gated browser submit; separate email-apply (`lib/apply/email-apply.ts`); MCP agent route deliberately omits submit (`app/api/apply/agent/route.ts`).
5. **Answer replay hazard** — meaning-class matching + `reusable: false` for employer-specific essays (`lib/apply/answer-class.ts`).
6. **Vault vs Convex crons** — sealed keys only in Next → secret-gated cron/agent routes (`app/api/cron/*`, `app/api/apply/agent/route.ts`).
7. **LaTeX page-length without local TeX / no good npm compiler** — Fly tectonic sidecar with package-cache warmup Dockerfile; Connect over HTTP/1.1 for Vercel; dual listeners because Node h2c cannot also serve HTTP/1.1 (`services/latex/`, `lib/resumes/latex-client.ts`).
8. **Model cannot measure page count** — compile → real `pages` → one repair pass only (`lib/resumes/latex-core.ts`).
9. **k8s scale-to-zero** — KEDA manifests as alternate to Fly’s free scale-to-zero (`services/latex/k8s/keda.yaml` comments).
10. **Agent accountability** — immutable task contracts; Ledger hard-stop; Sentinel verify path (`lib/orchestra/*`).
11. **SQLite → Convex migration** — code/deps are Convex; README still documents SQLite (`README.md`).

### Testing, CI/CD & quality
- No `.github/workflows`; no `*.test.*` / Jest / Vitest.
- Sanity check scripts (not wired into `package.json`): `scripts/check-apply-logic.ts`, `check-latex-resume.ts`, `check-us-location.ts`.
- Orchestra “Probe” role claims typecheck/tests as Layer 0 (`lib/orchestra/registry.ts`) — repo-level CI effectively absent.
- Deploy scripts: `convex:deploy`, Fly latex (`services/latex/README.md`), `npm run proto`, launchd cron, hosted Vercel cron routes; optional k8s/KEDA/kind.

**`package.json` scripts:** `dev`, `build`, `start`, `convex:dev`, `convex:deploy`, `seed`, `seed:catalog`, `pull-jobs`, `backfill`, `gmail:auth`, `daily`, `orchestra`, `eng`, `eng:review`, `retro`, `orchestra:eval`, `apply`, `cron:install`, `cron:uninstall`, **`proto`**.

**`.env.example` LaTeX/apply vars:** `DAYSPRING_LATEX_SERVICE_URL`, `DAYSPRING_LATEX_SERVICE_SECRET`, optional `DAYSPRING_LATEX_PROTOCOL` / `DAYSPRING_LATEX_GRPC_URL` / `DAYSPRING_TEX_ENGINE`; browser `DAYSPRING_BROWSER_PROFILE` / `DAYSPRING_CDP_URL`; MCP apply `DAYSPRING_AGENT_SECRET`, optional `DAYSPRING_APP_URL`.

### Gaps / questions for Areef
1. Live prod URL / public vs private GitHub?
2. Is `dayspring-latex` actually deployed and wired in prod (`DAYSPRING_LATEX_SERVICE_URL` set)?
3. Has the k8s/KEDA path been exercised, or Fly-only so far?
4. Any real second users beyond operator cron?
5. Quantified outcomes (jobs pulled/scored/applied, reply rates, $ spend, interviews, LaTeX one-page hit rate)?
6. Claim “migrated SQLite→Convex” as shipped milestone? (code yes; README still SQLite)
7. Orchestra / LaTeX / apply: daily-driver vs WIP?
8. Confirm scoring daily-cap / cost-per-job figures before resume use (`README.md` vs code).
9. Relationship to `job-scraper` auto-apply — which is canonical?

## Project: AirLog

- **One-line pitch:** Voice-first user-testing platform for QA/product teams to run structured sessions, capture tester feedback as voice/text, auto-transcribe and AI-classify notes, and export summaries/PDF reports.
- **Status & dates:** Active on branch `prod`; first commit `2025-12-12`, last `2026-03-23`; **282** commits; sole author Areef Syed; package `1.1.0`; proprietary license (`LICENSE`, © 2026 Areef Syed). Local folder name `echo_test`.
- **Links:** Repo `https://github.com/the-sniper/airlog.git`. Live default in code: `https://airlog-pro.vercel.app` (`src/lib/mail.ts`). Portfolio also links `https://airlog.live` — status `UNKNOWN — ask Areef`. Whisper Fly app `whisper-service`, region `iad`. License docs (no source) at `Misc/Collidascope-AirLog/`. Related snapshot repo `airlog-base` (2 commits) under Collidascope folder.

### Purpose & problem
Manual note-taking during live user tests is slow and biases results when testers see each other’s feedback. AirLog structures tests as scene-based sessions with join codes, captures voice via MediaRecorder, transcribes via self-hosted faster-whisper, classifies with OpenAI (`gpt-4o-mini`) + keyword fallback, and produces summaries/PDF reports. Multi-tenant company / super-admin / tester roles. GitHub PR merge → scene sync (or backlog) connects release testing to engineering workflows.

### Tech stack (be exhaustive and specific)
- TypeScript `^5.4.5`; Next.js **14.2.15**; React `^18.3.1`; Tailwind `^3.4.1` + Radix UI; recharts; three + R3F/drei; `@dnd-kit/*`; `@react-pdf/renderer`; jose; bcryptjs; nodemailer; OpenAI SDK; `@supabase/supabase-js` + SSR
- Whisper sidecar: Python **3.11**, Flask, **faster-whisper 1.0.3**, Docker/Fly (2 CPU / 4GB / `iad`, auto stop/start)
- Data: Supabase Postgres + Storage (`audio-recordings`, `company-logos`) + Realtime; client IndexedDB queue
- Infra: Vercel + cron (`vercel.json` daily → `/api/cron/check-notifications`); Fly Machines API for usage monitoring; GH Actions `airlog-sync.yml` (PR→AirLog sync, not app CI)
- AI: `gpt-4o-mini` (classify/summarize/PR parse); ASR faster-whisper model `small`, CPU `int8`, VAD
- `resend` in `package.json` but **never imported** in `src/`

### Architecture
Next.js monolith: **107** `route.ts` API files → Supabase; `/api/transcribe` proxies to Fly Whisper. Three JWT cookie realms (`admin_session`, `company_admin_session`, `user_session`). Durable client-first transcription: IndexedDB before network. **29** tables across **55** SQL migrations (`admin_users` renamed to `super_admins` in migration 027).

### What was actually built (feature inventory)
- IndexedDB transcription queue (max 10, 5 retries) — `transcription-queue.ts` (~423 LOC) + hook (~498 LOC)
- Voice recorder (Wake Lock, pause/resume, OS-kill auto-save) — `voice-recorder.tsx`
- Whisper proxy (60s timeout, 3 attempts) — `api/transcribe/route.ts`
- Note categories: `bug | feature | ux | performance | other`
- GitHub PR parse (LLM + regex), OAuth, external PR sync, backlog
- Multi-tenant companies, invites, join requests, soft-delete, audit logs
- Sessions (draft/active/completed), join codes, scheduling, polls + Realtime
- Per-note + session AI summaries; PDF reports; shareable public report tokens
- **16** `create*Email` builders; admin analytics + service usage/cost metering
- PWA + Three.js landing; DnD scenes; OTP verification; external session create API

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits | 282 | `git rev-list --count HEAD` |
| Date span | 2025-12-12 → 2026-03-23 | git |
| Author | Areef Syed only | `git shortlog` |
| `src/` TS/TSX LOC | **70,868** (256 files) | walk |
| API route files / HTTP handlers | 107 / **164** | find + ripgrep |
| SQL migrations / CREATE TABLE | 55 / 29 | `supabase/migrations` |
| Components LOC | ~17,316 (72 files) | walk |
| Automated tests | **0** | find |
| Fly VM | 2 CPU, 4GB, `iad` | `fly.toml` |
| Package version | 1.1.0 | `package.json` |

### Engineering challenges & solutions
1. Mobile/browser kills recording → Wake Lock + IndexedDB queue + background-stop detection.
2. Whisper cold starts → client queue + server retries + Fly auto-stop/start.
3. Messy PR bodies / unmatched PRs → LLM+regex parser + `github_pr_backlog`.
4. Multi-org SaaS from single-admin MVP → migration 027 + three JWT realms + tester note isolation.

### Testing, CI/CD & quality
No unit/E2E tests; `next lint`; Prettier referenced but not in dependencies; CI is PR-sync only; deploy Vercel + Fly Whisper. No `.env.example` despite README mention. README says “Self-hosted OpenAI Whisper” — code is **faster-whisper**.

### Gaps / questions for Areef
- Production usage counts? Commercial license details (which company; nameable?) — license docs exist in `Misc/Collidascope-AirLog/`
- Canonical live URL: `airlog.live` vs `airlog-pro.vercel.app`?
- Power BI reporting (on resume / master-knowledge) — not in this repo; confirm separately
- Whisper latency/accuracy in production?
- Purpose of `airlog-base` (2-commit Collidascope snapshot) vs main `airlog`?

---

## Project: Klyro

- **One-line pitch:** Embeddable multi-tenant AI portfolio chatbot with RAG over pgvector, persona controls, live tool calling, and a drop-in JS/npm widget.
- **Status & dates:** Solo; first commit `2026-01-21`, last `2026-03-12`; **113 commits**, author Areef Syed only. Branches include `main`, `auth`, `calls`, `cleanup`, `dev`, `landing`, `pwa`.
- **Links:** Repo `https://github.com/the-sniper/klyro.git`. Live defaults in code: `https://klyro-pro.vercel.app`. Marketing metadata uses `https://klyro.com` — DNS live status `UNKNOWN — ask Areef`. npm package `@klyro/widget` (package.json **v2.3.5**; source `WIDGET_VERSION = "2.3.3"`).

### Purpose & problem
Portfolio/personal sites need an accurate, on-brand assistant that answers from owner-verified knowledge (resume, projects, docs, site), not generic LLM guesswork. Klyro is an admin product + embeddable widget for that, with multi-tenant vector isolation.

### Tech stack (be exhaustive and specific)
- Next.js **14.2**, React **18**, TypeScript **5**, Tailwind **4.1**
- Framer Motion, GSAP, Three.js + R3F/drei/postprocessing (landing)
- Supabase Postgres + **pgvector** `vector(1536)`; **17** SQL migrations
- Custom cookie sessions + bcryptjs + OTP via Nodemailer/SMTP (not Supabase Auth)
- OpenAI: chat **`gpt-4o-mini`**, embeddings **`text-embedding-3-small`**
- Ingestion: `unpdf` (PDF), `mammoth` (DOCX), TXT/MD, URL
- Tools: GitHub REST, URL fetch, Calendly API
- Widget: esbuild dual-build; Vitest + coverage; GA via `@next/third-parties`; PWA (`sw.js`)

### Architecture
Admin Next app → ingest (chunk ~300 tokens / 50 overlap → embeddings → `document_chunks`) → chat: query rewrite → `match_document_chunks` RPC (cosine `<=>`, IVFFlat, **`filter_user_id`**) → keyword re-rank → persona prompt → optional tool loop → citations. Widget loads `/api/widget/[key]`, chats via CORS `/api/chat`, domain + route allowlists.

### What was actually built (feature inventory)
- Full RAG pipeline — `src/lib/ai/rag.ts` (~1,070 LOC)
- 5 tools: latest projects, URL content, repo details, Calendly options/slots
- Strict/grounded mode prompts; source citations
- Document ingest PDF/DOCX/URL/text; persona + presets
- Embeddable widget (~1,592 LOC source) with theme/position/routes/SPA history patch
- Auth signup/login/OTP; admin knowledge/conversations/integrations/test-chat
- 3D marketing landing; PWA install
- **17** API route groups under `src/app/api/**`

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits | 113 | git |
| Date span | 2026-01-21 → 2026-03-12 | git |
| LOC (src+widget+sql, excl. huge CSS) | ~14.4k TS/JS/SQL | walk |
| `rag.ts` / widget `index.js` | ~1,070 / ~1,592 LOC | `wc -l` |
| API routes / SQL migrations | 17 / 17 | find |
| Embedding dim / IVFFlat lists | 1536 / 100 | migrations |
| Retrieve / re-rank / history | top-15 → 10; last 8 msgs | `rag.ts` |
| Vitest files / `it`+`test` cases | 6 / **26** | find + ripgrep |
| Chunking | 300 tokens / 50 overlap | `embeddings.ts` |
| First-week npm downloads | 1,100+ | owner-reported in master-knowledge — **not in repo** |

### Engineering challenges & solutions
1. Follow-up queries break vector search → conversational query rewrite.
2. Keyword misses on dense resumes → low threshold + keyword re-rank.
3. Multi-tenant leakage → `user_id` filter on chunks + filtered RPC (migration 005).
4. Hallucinated experience → strict mode + tool allowlists.
5. Cross-origin embed → CORS + domain allowlist.
6. Em-dash “AI tell” → post-process strip of `\u2014`/`\u2013`.

### Testing, CI/CD & quality
Vitest unit tests (session, embeddings, Calendly, GitHub/portfolio parsers, RAG context). No GitHub Actions found. Deploy implied by Vercel URL in widget. README “~25KB” widget size conflicts with prior measurement ~152KB built — `UNKNOWN — ask Areef` for current gzipped size.

### Gaps / questions for Areef
- Is `klyro.com` live?
- Active third-party sites/widgets / chats served (admin DB can supply)?
- Widget version 2.3.5 vs source 2.3.3?
- Paying users? Confirm npm download figure with package stats.

---

## Project: Hound

- **One-line pitch:** AI-native browser test platform: Playwright execution, CDP live view over WebSocket, and Claude agents for generate/heal/assert/recover.
- **Status & dates:** Solo; first commit `2026-02-21`, last `2026-02-22`; **19** commits on current branch / ~**20** on `main`; author Areef Syed. Intense ~2-day committed window; substantial uncommitted work may exist (master-knowledge notes work through Feb 23).
- **Links:** Repo `https://github.com/the-sniper/hound.git`. README is stock create-next-app — **no production URL**. UI placeholder copy mentions `https://app.hound.ai`. Local WS default port **3001**.

### Purpose & problem
Teams need browser E2E easier than hand-writing Playwright: record/generate tests, run with AI healing, watch live browser, analyze a11y/perf/security, integrate into CI via CLI.

### Tech stack (be exhaustive and specific)
- Next.js **15.5.12**, React **19.1**, TypeScript, Tailwind **4**, Radix/shadcn, Framer Motion, dnd-kit
- NextAuth **v5** beta + bcryptjs + JWT; Prisma **6** → PostgreSQL 16 (Docker Compose); optional MinIO/S3 (`@aws-sdk/client-s3`)
- Playwright Chromium pool; CDP screencast; `ws` WebSocket via Next `instrumentation`; SSE fallback
- Anthropic primary `claude-sonnet-4-20250514`; OpenAI `gpt-4o-mini` fallback
- `pixelmatch` + `pngjs`; axe-core a11y; Zod 4
- CLI `@hound-ai/cli` (Commander); plugins Slack/GitHub/Jira/Linear; Sentry/Datadog webhooks

### Architecture
Dashboard CRUD → executor + stepHandlers → screenshots/HAR/video → AI recovery → Prisma results. Live view: CDP `Page.startScreencast` → binary WS rooms by `runId` (or SSE) + input forwarder. Recorder → action recognizer → AI step refine. Parallel runs default concurrency **4**. CI template dogfoods CLI.

### What was actually built (feature inventory)
- **30** `StepType` enum values / **29** handlers (`ASSERT_VISUAL` schema-only, no handler) — `prisma/schema.prisma`, `step-handlers.ts`
- Executor + recovery agent; CDP screencast live view; WS server + heartbeat
- Recorder sessions; AI test generate; Playwright import/export
- Visual diff; a11y / perf / security analysis; chaos network steps
- Environments, vars, auth states, step cache (3-tier resolution: memory → DB TTL → AI locator)
- Schedules, webhooks, coverage + impact analysis, plugins, Sentry/Datadog → AI test gen
- CLI + `.github/workflows/hound-tests.yml`; **62** API routes; **20** Prisma models; **16** app pages

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits (branch window) | 19 (Feb 21–22, 2026) | git |
| LOC (src+packages+prisma, excl. generated) | ~28.7k | prior/ refreshed walk |
| API routes / Prisma models | 62 / 20 | find |
| Step types / handlers | 30 / 29 | schema + handlers |
| AI agent modules | ~10–11 | `src/lib/ai/*` |
| Screencast defaults | 15 fps, quality 65, max 1280×720 | screencast code |
| Parallel concurrency default | 4 | `parallel-executor.ts` |
| Automated unit tests | **0** | find |

### Engineering challenges & solutions
1. Remote browser watching → CDP screencast + binary WS + SSE fallback.
2. Flaky selectors → AI locator + recovery actions.
3. Vendor AI lock-in → Anthropic-first with OpenAI fallback.
4. Artifact portability → local vs S3 abstraction.
5. WS inside Next → instrumentation hook + `serverExternalPackages: ["ws"]`.
6. Schema/runtime gap → `ASSERT_VISUAL` unfinished.

### Testing, CI/CD & quality
No app unit/e2e tests. CI workflow installs `@hound-ai/cli` and runs Hound (dogfoods product). ESLint present; no `npm test` at root. Production deploy status `UNKNOWN — ask Areef`.

### Gaps / questions for Areef
- Ever deployed beyond localhost? Real project runs/customers?
- How much AI-scaffolded vs hand-built in 2-day burst?
- `@hound-ai/cli` published to npm?
- Phase completion % / relationship to Dayspring?

---

## Project: Portfolio (areefsyed.com)

- **One-line pitch:** AI-native personal site — chat-first portfolio that answers as Areef with grounded tool-rendered UI cards, plus classic “Read” mode, Hiring Fit JD matcher, leave-a-note, and Clerk-protected visitor analytics admin.
- **Status & dates:** First commit `2025-01-30` (placeholder era); major rebuild from `2026-07-19`; last commit `2026-07-30`; **59** total commits (**51** since rebuild); authors Areef Syed **58**, `the-sniper` **1**.
- **Links:** Repo `https://github.com/the-sniper/portfolio.git`. Site URL constant `https://areefsyed.com` (`lib/site.ts`). Vercel project id present under `.vercel/`. Custom-domain DNS confirmation: `UNKNOWN — ask Areef`.

### Purpose & problem
Static portfolios can’t answer recruiter questions or show fit against a JD. One content source (`data/portfolio.ts`) feeds chat tools, classic mode, and the system prompt so the AI only speaks grounded facts; Hiring Fit classifies JDs with canonical caching; Convex captures anonymous analytics and leads; `/admin` protected by Clerk.

### Tech stack (be exhaustive and specific)
- Next.js `^15.3.0`, React `^19`, Tailwind **4.1**, Framer Motion, Geist + Instrument Serif, Zod
- Vercel AI SDK `ai` `^5` + `@ai-sdk/openai` / `@ai-sdk/anthropic` / `@ai-sdk/react`; defaults `gpt-5.6-terra` / `claude-sonnet-5`
- Convex `^1.42.3`; Clerk `@clerk/nextjs` `^7.5.20`
- mapbox-gl / maplibre-gl / cobe; WebGL fluid cursor; Resend (env); optional GA4
- Vitest + `convex-test`; `test:match` via `tsx`

### Architecture
SSOT `data/portfolio.ts` (~1405 LOC). Chat `/api/chat` with **7** tools, rate limit 20/min/IP, `stopWhen: stepCountIs(3)`. Match `/api/match` with fingerprint+version cache (`MATCHER_VERSION = "1"`). Convex **9** tables + crons (traffic spike 15m, weekly summaries, prune). Globe fallbacks: Mapbox → MapLibre → cobe. Offline grounded fallback when no AI key.

### What was actually built (feature inventory)
- Chat-first landing with preset chips, streaming tool UI, theme toggle, SplashCursor
- Classic/Read mode: hero, projects (**9**), skills (6 groups), experience (**6**), education (**3**), testimonials (**11**), gallery
- Project detail routes `/projects/[slug]`; Hiring Fit matcher; leave-a-note
- Résumé chooser (2 visible PDFs; Data variant `hidden: true`, PDF missing)
- SEO (robots/sitemap/OG/JsonLd); admin analytics dashboard; conversation persistence

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits | 59 (51 since rebuild) | git |
| App source LOC (excl. `_generated`) | **19,450** across 80 TS/TSX | walk |
| API routes | 3 (`chat`, `match`, `inquiry`) | `app/api` |
| Convex tables / chat tools | 9 / 7 | schema + tools |
| Vitest analytics tests | **4 passed** | `vitest run` (2026-08-02) |
| Match determinism checks | **7 passed** | `tsx lib/ai/matchDeterminism.test.ts` |
| Rate limits | chat 20/min; match 8/min | route constants |
| CI workflows | 0 | no `.github/workflows` |

### Engineering challenges & solutions
1. Hallucination risk → SSOT + tool-only grounded answers + offline fallback.
2. Unstable Hiring Fit scores → separate matcher + canonical cache + determinism tests.
3. Works without AI keys → `fallbackRespond`.
4. Map/token portability → 3-tier globe.
5. Privacy-conscious analytics → random session IDs; Clerk allowlist; prune crons.

### Testing, CI/CD & quality
`test:analytics` (Vitest), `test:match` (assert script), `next lint`. Deploy: GitHub → Vercel + Convex + Clerk JWT. No GH Actions CI.

### Gaps / questions for Areef
- Confirm `areefsyed.com` prod wiring + traffic numbers
- Resume dating: full span vs Jul 2026 rebuild only?
- Portfolio `airlog.live` vs AirLog code default URL mismatch
- Content TODOs still open (avatar, LinkedIn testimonial text, YoE)?

---

## Project: Conduit (code name: poolside)

- **One-line pitch:** Self-service control plane for F5 BIG-IP load balancers — Django UI/JSON API over a Postgres cache, with all device I/O deferred to Celery so operators can drain/offline/enable pool members without blocking web requests.
- **Status & dates:** Local development; file mtimes **2026-07-25 → 2026-07-29**; Django migration stamped **2026-07-26**. **No `.git` directory** — commit dates/counts/authors/remote `UNKNOWN — ask Areef`. Path: `/Users/areefsyed/Desktop/Misc/Django/poolside`. All code/paths still say `poolside`; “Conduit” is the intended product name (prior dump / master-knowledge).
- **Links:** Repo URL `UNKNOWN — ask Areef`. Local `http://localhost:8000`. No live host confirmed.

### Purpose & problem
F5 iControl REST is slow/flaky; putting it in request handlers hangs the UI. Conduit keeps Django as a read-mostly control plane over cached pool/member state and routes every device touch through Celery (15s sync + mutating actions with retry/backoff). Includes a flaky stub device for local E2E of retries.

### Tech stack (be exhaustive and specific)
- Python 3.12 (Docker) / local venv may differ; Django **5.1.x**; Celery **5.x**; Redis **7** (broker `/0`, results `/1`); PostgreSQL **16**; psycopg3; requests; python-json-logger; gunicorn (declared, **unused** in compose — uses `runserver`); Ansible; Chart.js **4.4.1** CDN; pytest
- Docker Compose **7** services: db, redis, f5stub, web, worker, beat, vector (`timberio/vector:0.40.0-debian`)
- **Not present:** Django REST Framework (README “DRF-style” = plain `JsonResponse`)
- No LLM; no cloud CI; Ansible deploy to `/opt/poolside`

### Architecture
Browser → Django (templates + JSON) reads Postgres only; Celery worker/beat ↔ F5/stub via Redis. Beat `sync_pools` every **15s**. Mutations create `Operation` + `apply_member_state` (`max_retries=4`, backoff cap 60s). Dashboard polls every **3s**; timeseries last **15 min** @ 15s buckets. Models: Pool, Member, Operation, MemberSample, StateChange. Structured `f5.*` events → Vector.

### What was actually built (feature inventory)
- iControl REST client (token auth, `~Partition~name` refs, nested stats, PATCH drain/offline/enable) — `lb/f5_client.py` (142 LOC)
- Periodic + on-demand sync with samples + health transitions — `lb/tasks.py`
- Async member actions + operation status polling; live dashboard (Chart.js, state-change feed)
- Stub F5: **2** pools / **5** members; flake 0.15, flap 0.06 — `stub_f5/app.py`
- JSON logging + Vector; Compose stack; Ansible; Django admin; **6** pytest tests for F5 client

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| pytest | **6 passed** | `python -m pytest -q` (2026-08-02) |
| Models / Celery tasks / HTTP routes | 5 / 2 / 7 | models, tasks, urls |
| Sync / poll / chart | 15s / 3s / 15 min | celery.py, dashboard |
| Compose services | 7 | `docker-compose.yml` |
| Python app LOC (excl. migrations/venv) | **893** | walk |
| Git history | UNKNOWN (no `.git`) | — |
| Real BIG-IP use | UNKNOWN — ask Areef | stub-only evidence |

### Engineering challenges & solutions
1. Keep web requests off the device — views only read Postgres / enqueue Celery.
2. Intermittent device failures — `F5ConnectionError` vs `F5Error`; stub 503s exercise autoretry.
3. iControl impedance — token auth, URL-encoded refs, nested stats (unit-tested).
4. Live ops UX — 15s sync + 3s poll + operation status polling.

### Testing, CI/CD & quality
pytest only (F5 client); no DB/integration/Celery tests; no CI; no ruff/mypy. Compose uses `runserver`, not gunicorn. Control panel has CSRF but no login gating.

### Gaps / questions for Areef
- Initialize git / remote / rename poolside→Conduit?
- Ever pointed at a real BIG-IP?
- Solo vs employer context? gunicorn intended prod setup?
- Auth intentional absence for demo?

---

## Project: GesturePro

- **One-line pitch:** Full-stack ASL sign-to-text PWA with webcam capture, YOLOv8 inference, dual auth (JWT + Google), and WLASL-based data/training pipelines.
- **Status & dates:** First `2025-04-15`, last `2025-06-10`; **56 commits**. Remote: `https://github.com/khushboohpatel/gesturepro.git`. README title “Interactive-Sign-Language-Translator”.
- **Links:** Config refs `gesturepro-dev.vercel.app` — live `UNKNOWN — ask Areef`.

### Purpose & problem
Live-camera ASL → text (+ optional TTS). Non-trivial: YOLO detections → session sentence building; dual-auth PWA; offline WLASL/keypoint pipeline; alternate MediaPipe+TCN/LSTM track **not wired to API**.

### Tech stack (be exhaustive and specific)
- Client: Next.js `^15.3.2`, React 18, MUI 5, Tailwind 3, next-auth **4.24.5**, next-pwa **5.6.0**, react-webcam
- Server: FastAPI **0.104.1**, Ultralytics YOLOv8, torch, OpenCV, SQLAlchemy **2**, PostgreSQL **16**, python-jose, passlib
- Docker Compose (db+backend+frontend); yt-dlp for WLASL; browser SpeechSynthesis TTS
- YOLO **23** classes, imgsz 640; `SentenceBuilder` (stability 3, min conf 0.5, 1.0s debounce); 1.5s frame polling

### Architecture
Next PWA ↔ FastAPI ↔ Postgres; YOLO at startup; HTTP frame poll + `X-Session-ID` (no WebSockets); JWT + NextAuth unified in middleware. **16** API endpoints.

### What was actually built (feature inventory)
- Signup/login JWT; Google OAuth; dual-auth middleware; video page webcam + predict + TTS
- Sign APIs: predict-stream/base64/batch, sentence GET/DELETE, model info/classes/reload
- PWA manifest/SW/install/splash; WLASL filter/download/keypoint; YOLO train notebooks; offline TCN/LSTM
- Placeholders only: Audio, Transcripts, Profile

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits | 56 | git |
| Areef commits | **35** (26 + 9 name variants) | shortlog |
| Team | Areef, eparirishit/Rishit, khushboohpatel, yeoleshweta | shortlog |
| YOLO classes / weights | 23 / 6.0 MB | `class_names.json`, `.pt` |
| WLASL glosses / instances | 2,000 / 21,083 | `WLASL_v0.3.json` |
| MP4s / main NPY split | 468 / 320·78·70 | find |
| NPY total incl. top10 | 606 | find |
| API endpoints | 16 | routes |
| Client JS LOC / server PY LOC | ~3,479 / ~969 (server); ~1,824 all PY | wc |
| mAP/accuracy in repo | None | — |
| Tests | 0 | find |

### Engineering challenges & solutions
1. Dual JWT + Google auth middleware.
2. Noisy YOLO → `SentenceBuilder` stability/conf/debounce.
3. 1.5s multipart polling instead of WebSockets.
4. PWA camera constraints; NumPy `<2` pin.

### Testing, CI/CD & quality
No tests/CI. Docker healthchecks. Client lint.

### Gaps / questions for Areef
- Per-person scope? Why under `khushboohpatel`?
- Naming: GesturePro vs Interactive Sign Language Translator?
- YOLO metrics? How 23 classes if local annos are ~5?
- LinkedIn “4,000+ training samples” / dual YOLOv8+LSTM — confirm vs repo (468 videos; LSTM not wired)

---

## Project: Fact Checker

- **One-line pitch:** Full-stack AI fact-checking app that extracts claims, retrieves web evidence, and returns per-claim verdicts, reasoning, corrections, and citations via a pluggable multi-stage solver pipeline.
- **Status & dates:** First `2025-03-17`, last `2026-04-09`; **38 commits**. Remote: `https://github.com/eparirishit/fact-checker.git`.
- **Links:** Loom demo (README): `https://www.loom.com/share/391e17637fcb4e4b834ec11532c08b0d`. “Factchecker.ai” live status `UNKNOWN — ask Areef`. Alternate clone URL in frontend README: `the-sniper/fact-checker` (≠ current remote).

### Purpose & problem
Verify free-text/LLM claims against web evidence. Pluggable pipeline (claim → retrieve → verify) integrating Factool / FactCheckGPT / RARR, async OpenAI, Serper, optional CrossEncoder / RoBERTa NLI.

### Tech stack (be exhaustive and specific)
- Frontend: Next.js **^15.5.15**, React **19**, MUI **6.4.6**, Tailwind **4**, Formik/Yup
- Backend: FastAPI + vendored OpenFactCheck; backoff; spaCy/NLTK; sentence-transformers; torch; transformers; Serper; optional Azure Bing
- Infra: Docker Compose; GCP Cloud Run workflow (8Gi/4CPU); HF Spaces warm-ping cron 6h; Vercel frontend
- **25** `@Solver.register` solvers

### Architecture
Next.js UI → BFF `/api/evaluate` → FastAPI `/evaluate-response` → sequential solvers with streaming. No persistent DB; `tmp/output/*.jsonl`; 7 offline benchmark JSONL files.

### What was actually built (feature inventory)
- API: `POST /evaluate-response`, `GET /available-components`, `GET /health`
- Factool default webservice solvers; FactCheckGPT + RARR registered
- FE fact-check UI with citations; Next proxy with optional HF Bearer
- Async OpenAI + backoff/batching; multi-target deploy matrix

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits | 38 | git |
| Authors | eparirishit 15, Rishit Epari 12, Areef 11 | shortlog |
| Python LOC / files | **8,001** / 86 | wc |
| Registered solvers | 25 | decorator registry |
| Backend routes | 3 | `app.py` |
| Benchmark JSONL lines | 6,474 (7 datasets) | `wc -l` |
| Tests | 0 | find |

### Engineering challenges & solutions
1. Vendored OpenFactCheck after removing package dep.
2. 25-solver plugin registry across research stacks.
3. Async LLM limits — backoff + `asyncio.gather` + JSON fallbacks.
4. Multi-target deploy + Next proxy for HF auth.

### Testing, CI/CD & quality
No unit/e2e tests. GCP deploy `workflow_dispatch` only. HF warm every 6h. Docker `/health`.

### Gaps / questions for Areef
- Precise scope vs Rishit? Canonical repo owner?
- Live URLs? Benchmarks used for published metrics?
- Course vs product framing?

---

## Project: EcoMed AI (ecomedai)

- **One-line pitch:** Healthcare sustainability hackathon app that classifies medical waste from images into disposal bins and recommends lower-carbon supply alternatives from hospital BOMs.
- **Status & dates:** Philly {Codefest} 25; first `2025-03-01`, last `2025-03-06`; **36 commits**; local-only (no deploy configs). Remote: `https://github.com/the-sniper/ecomedai.git`.
- **Links:** Live/demo URL `UNKNOWN — ask Areef`.

### Purpose & problem
Hospitals need help sorting biomedical waste and choosing lower-impact supplies. Non-trivial: ResNet50 vision → bin colors; FAISS + Gemini matches BOM items against an LCA catalog.

### Tech stack (be exhaustive and specific)
- Frontend: Next.js **15.2.0**, MUI **6.4.6**, MUI X Data Grid/Charts, Recharts, Formik/Yup, Tailwind **4**
- Backend: FastAPI, PyTorch/torchvision ResNet50, LangChain + FAISS + `all-MiniLM-L6-v2`, Gemini `gemini-2.0-flash` via `ChatGoogleGenerativeAI`
- Storage: CSV only (`healthcare_lca_master_data.csv`, sample BOM); FAISS in-memory; no SQL; no Docker/CI
- Weights: `medical_trash_classifier.pth` (**90 MB**); 7 classes → 4 bins; train 15 epochs

### Architecture
Frontend + unified FastAPI mounting `/medical` and `/supply`. Hardcoded `http://127.0.0.1:8000`. Supply resources preloaded at startup.

### What was actually built (feature inventory)
- Sustainable Coach: image → `POST /medical/predict` → bin highlight
- Procurement: CSV BOM → FAISS + Gemini rerank + carbon alternatives
- Sustainability dashboard — **static/mock**, not connected to backend
- README department audit — **not implemented**

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits / window | 36 / 6 days | git |
| Authors | Areef 13, Rishit 11, Chanakya 8, Khushboo 4 | shortlog |
| LCA catalog data rows | **3,010** | CSV |
| Sample BOM rows | 16 | CSV |
| Python / FE JS LOC | **782** / **907** | wc |
| FastAPI endpoints | 2 | source |
| Tests | 0 | find |

### Engineering challenges & solutions
1. CORS Next↔FastAPI.
2. Cold-start — startup preload LCA/FAISS/Gemini.
3. Two apps via `app.mount`.
4. LLM JSON fragility — fence strip / substring extract; UI warns up to ~5 min.

### Testing, CI/CD & quality
No tests/CI. Frontend lint; FastAPI Swagger. Classifier accuracy not stored in repo.

### Gaps / questions for Areef
- Demo URL? Model accuracy / dataset size? Hackathon placement?
- Personal scope beyond 13 commits?

---

## Project: Forecast My Park

- **One-line pitch:** Full-stack US National Park visitor forecasting app with per-park Prophet models, Next.js map/chart dashboard, and a **synthetic** multi-feature visitor dataset.
- **Status & dates:** **1 commit** `2025-07-13` by Areef (author string `“Areef`); deploy script → AWS ECR/ECS; live URL `UNKNOWN — ask Areef`. Remote: `https://github.com/the-sniper/forecast_my_park.git`. Note: `*.md`, `docker-compose.yml`, `aws-infrastructure/`, `.env*` gitignored — no README in repo.
- **Links:** Repo above. Local ML docs at `/docs` when service running.

### Purpose & problem
Anticipate crowd levels at NPS units over a chosen horizon. **Training data is synthetic** (hash-based simulation), not real NPS stats — never present otherwise.

### Tech stack (be exhaustive and specific)
- Frontend: Next.js **15.3.4** (`standalone`), React **19**, Tailwind **4**, Leaflet, Recharts, Headless UI
- ML: FastAPI, Prophet ≥1.1.5, joblib, pandas, numpy, SQLAlchemy 2, PostgreSQL
- Infra: Dockerfiles; nginx rate limit; `deploy.sh` → ECR + optional ECS `forecast-my-park-cluster` (`us-east-1`); no GH Actions
- Prophet + 10+ regressors, monthly/quarterly seasonalities, **80%** CI, CV 60d/30d/30d; 24h in-memory model cache

### Architecture
Synthetic generator → PostgreSQL; FastAPI ML service; Next BFF → `ML_SERVICE_URL`. Per-park models. Park coords duplicated FE+ML (**71** codes). **19** committed Prophet artifacts for **30** parks in generator.

### What was actually built (feature inventory)
- Generator: 30 parks, holidays/weather/school/gas factors
- Prophet train/predict/cache; FastAPI health/parks/predict/stats/train/performance
- Dashboard Map/Chart with CI band; AWS deploy script + nginx

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits | 1 | git |
| Parks / committed models | 30 / 19 | generator + `models/` |
| App source LOC | **3,791** (PY 1,840 + TS/TSX 1,951) | wc |
| Horizon API / UI | 1–365 / 1–90 days | `main.py` / `page.tsx` |
| Dataset scale | ~38.7k = ~1290d×30 (docstring “39,000+”) | code |
| Stored MAE/MAPE/RMSE | None in repo | train-time only |
| Tests / CI | 0 / none | find |

### Engineering challenges & solutions
1. Synthetic multi-factor TS instead of NPS scrape.
2. Per-park Prophet + on-demand train + 24h cache.
3. Docker + ECR/ECS + nginx rate limits.
4. Gaps: nginx `/api/` vs Next BFF mismatch; health field naming; Next `ignoreBuildErrors`.

### Testing, CI/CD & quality
No tests/Actions. Manual `deploy.sh`. Build ignores TS errors.

### Gaps / questions for Areef
- Live demo / ECS used?
- LinkedIn claims NPS API / Snowflake / Tableau / CloudFormation — **not in repo**; reconcile or drop
- Actual MAPE for flagship parks? Why 19/30 models?

---

## Project: grit

- **One-line pitch:** Personal PWA diet/supplement tracker with Turso cloud sync and an OpenAI health/meal coach grounded in lab context.
- **Status & dates:** Solo; branch `health` only; first `2026-05-25`, last `2026-05-28`; **6 commits**, Areef Syed. No README.
- **Links:** Repo `https://github.com/the-sniper/grit.git`. No production URL in code. Manifest name: **“Plan Tracker”**.

### Purpose & problem
Daily adherence to a personalized lean/bulk meal + supplement protocol (with lab-informed coaching), offline-friendly on phone, synced across devices.

### Tech stack (be exhaustive and specific)
- Next.js **14.2.35**, React **18**, TypeScript
- PWA via `@ducanh2912/next-pwa`; localStorage primary; Turso/libSQL (`@libsql/client`) via `/api/sync`
- OpenAI Chat Completions (`gpt-4o-mini` or `OPENAI_MODEL`) + local rule-based fallback
- No auth, Prisma, tests, or CI

### Architecture
Single-page Tracker; localStorage immediate → debounced 1.2s `POST /api/sync`; mount pull merges cloud. Coach API assembles large system context from plan/meals/supplements/health report. **2** API routes with code (`coach`, `sync`); empty `health-report` API dir.

### What was actually built (feature inventory)
- Lean vs bulk plans, bulk phases, calorie/protein targets — `lib/data.ts`
- Daily checklist; ~32 meal options w/ macros + recipe URLs; multi-phase supplement protocol
- Health-report grounded coach; Turso sync; PWA standalone + dynamic icons

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits / window | 6 / 4 days | git |
| LOC (app+lib+components) | ~4,202 | walk |
| Meal options | ~32 | `lib/meal-options.ts` |
| API routes | 2 | find |
| Tests / CI | 0 / 0 | find |

### Engineering challenges & solutions
1. Offline-first → localStorage + background Turso upsert.
2. Coach needs clinical + plan context → large assembled system prompt.
3. No API key → deterministic local coach replies.
4. Recipe follow-up drift → history preservation (commit `384720c`).

### Testing, CI/CD & quality
None. Typed TS personal tool.

### Gaps / questions for Areef
- Deployed? Public vs private? Name grit vs Plan Tracker?
- OK to cite health/lab-context engineering on resume (privacy)?
- Auth missing by design?

---

## Project: job-scraper (career-ops derivative)

- **One-line pitch:** Local career-ops-based job discovery + Playwright auto-apply toolchain (form fill, scan history, learned answers), hosted as `yeoleshweta/job-scraper`.
- **Status & dates:** Remote `https://github.com/yeoleshweta/job-scraper.git`. **2 commits**: initial `2026-04-29` (yeoleshweta); Areef `2026-04-30` “Fixed bugs”. VERSION `1.2.0`. Package/README still branded career-ops / points at `santifer/career-ops`.
- **Links:** `https://github.com/yeoleshweta/job-scraper.git`.

### Purpose & problem
Extend career-ops-style search with resilient auto-apply: discover jobs, fill ATS forms, dedupe via scan history, halt on CAPTCHA/account walls.

### Tech stack (be exhaustive and specific)
- Node `.mjs`, Playwright `^1.58.1`, yaml; career-ops modes/docs/PDF/tracker scripts
- Extra: `auto-apply.mjs` (~2012 LOC), `fill-form.mjs` (~1332), `batch-apply.mjs`, `rapid-apply.mjs`, Perplexity helpers, answers/learned-answers YAML

### Architecture
Portal YAML → Playwright discover/apply → status TSV → pause with macOS alert on blockers. Form fill from answers YAML + learned answers.

### What was actually built (feature inventory)
- Upstream-like evaluate/PDF/scan/tracker surface (from initial commit)
- Auto-apply pipeline with cooldown, dry-run, min-score filters
- Areef commit: large apply/fill expansion, learned-answers, scan-history growth

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Commits / Areef | 2 / **1** | git |
| Tracked companies (`careers_url`) | ~78 | local `portals.yml` |
| scan-history rows | ~1302 data | TSV |
| Status mix (approx) | discovered 819; applied **3**; flagged_captcha 3; … | TSV counter |
| Tailored CV md files | 37 | `cv-*.md` |
| Apply-related mjs LOC (4 files) | ~3,757 | wc |

### Engineering challenges & solutions
1. ATS heterogeneity — Playwright fill + learned-answers YAML.
2. Dedup/cooldown against scan history.
3. Human halt on CAPTCHA/account wall.
4. Browser context recreate after protocol disconnects.

### Testing, CI/CD & quality
Inherits `test-all.mjs`; no GH Actions. Manual apply debugging via PNG screenshots.

### Gaps / questions for Areef
- Role vs yeoleshweta? License/attribution for resume?
- Successful applies beyond TSV `applied: 3`?
- Overlap with Dayspring apply — which is canonical?

---

## Project: Career-Ops (upstream clone)

- **One-line pitch:** Open-source AI job-search pipeline for Claude Code — evaluate offers, generate ATS PDFs, scan portals, track applications (human-in-the-loop by design).
- **Status & dates:** Upstream `santifer/career-ops`; local clone first upstream commit `2026-04-04`, latest `2026-04-07`; **40 commits**. VERSION `1.1.0`. **Areef commits in this git history: 0** (Santiago 33 + community; 1 Areef email appears in shortlog on some clones — treat as contributor noise / verify). Local untracked: `cv.md`, batch artifacts.
- **Links:** `https://github.com/santifer/career-ops`. Case study: `https://santifer.io/career-ops-system`. MIT.

### Purpose & problem
Replace spreadsheet job search with agentic evaluate → PDF → tracker pipeline. README claims author evaluated **740+** offers / **100+** CVs — **upstream author’s metrics, not Areef’s**.

### Tech stack (be exhaustive and specific)
- Node `.mjs` + Playwright `^1.58.1`; Go **1.24.2** TUI (Charm Bubble Tea / Lip Gloss); **21** markdown modes under `modes/`; TSV tracker; example portals YAML **76** `careers_url` entries
- No Docker/Cloud deploy; no CI workflows (FUNDING + issue templates only)

### Architecture
Claude Code slash-command modes orchestrate Playwright + file-based tracker; Go TUI; integrity scripts (`merge`/`dedup`/`normalize`/`verify`/`doctor`).

### What was actually built (feature inventory)
Upstream product surface only in this clone — **not Areef-authored**. Evaluate pipeline, ATS PDF, portal scanner, batch workers, dashboard TUI, `test-all.mjs`.

### Quantifiable facts
| Fact | Value | Source |
|------|-------|--------|
| Upstream commits (local main) | 40 | git |
| Areef commits | **0** (primary authorship) | shortlog |
| Modes `.md` | 21 | find |
| Example companies | 76 | `templates/portals.example.yml` |

### Testing, CI/CD & quality
`test-all.mjs`; `npm run doctor`. No GH Actions CI.

### Gaps / questions for Areef
- Cite as tool used, not built?
- Your personal eval/apply counts (not santifer’s 740+)?
- Relationship to job-scraper / Dayspring?

---

## Project: ESM Tool (Backend + dual CRA clients)

- **One-line pitch:** Ex-Servicemen (ESM) registry platform — Spring Boot API + CRA React user app + admin app for service/pension/personal data, document uploads, widow profiles, and smart search.
- **Status & dates:** Three repos under `Code/ESM Tool/`:
  - **Backend** `ESM-Management`: `https://github.com/KarthikE6117/ESM-Management.git` — first `2023-01-28`, last Areef touch `2026-05-13`; **94** commits; Areef **~9**
  - **ESM-frontend**: `https://github.com/the-sniper/ESM-frontend.git` — first `2023-05-01`, last `2026-05-13`; **59** commits; Areef **~50**
  - **ESM-admin**: `https://github.com/the-sniper/ESM-admin.git` — first `2023-11-11`, last `2026-05-13`; **44** commits; Areef **~42**
- **Links:** Remotes above. Production URL `UNKNOWN — ask Areef`. Local API `http://localhost:8080`.

### Purpose & problem
Maintain Ex-Servicemen data registry: multi-section forms (service, pension, personal, contact, employment, spouse, dependents), document vault, admin dropdown masters, widow registration (`|W` service-number suffix), clerk/director roles, SmartFilter search, Excel export.

### Tech stack (be exhaustive and specific)
- Backend: Java **8**, Spring Boot **2.7.4**, Spring Web + WebFlux, Spring Data JPA, MySQL (`sainik_prod`), OAuth2 resource server, Auth0 `java-jwt` + `jjwt`, Lombok, Springfox Swagger, Apache POI **5.2.3**
- Frontends: CRA (`react-scripts` 5), React **18.2**, MUI **5**, Formik/Yup, axios, react-router-dom **6**, react-dropzone; admin also `xlsx` / `file-saver`
- **Security note:** `application.properties` in repo contains live-looking DB/JWT credentials — secret-leak risk; do not paste on resume.

### Architecture
Spring REST (`/ESM/*`, `/Admin/*`, `/files/*`, `/dd/*`, `/Widow/*`, `/SmartFilter/Filter`) + JWT; two React SPAs. Form progress computed dynamically; widow profiles linked to ESM rows.

### What was actually built (feature inventory)
- Auth register/login; ESM + Admin CRUD form sections; file upload/download per doc type
- Dropdown masters; WidowController + FE widow login/regType; admin Search/Dropdowns/Excel
- SmartFilter API (Areef: IN-operator arrays); MessageService; Director/Clerk controllers
- Areef recent: dynamic form progress, Lombok maven config, widow profile FE, `|W` normalization

### Quantifiable facts (for XYZ-format resume bullets)
| Fact | Value | Source |
|------|-------|--------|
| Backend / FE / Admin commits | 94 / 59 / 44 | git |
| Areef commits (approx) | 9 / 50 / 42 | shortlog |
| Java files / LOC (main) | 145 / **~10,052** | find/wc |
| Controller mapping annotations | ~159 | ripgrep |
| FE / Admin JS LOC | ~13,096 / ~18,359 | `src` wc |
| Form sections for complete submit | 6 | `UserService` |
| Unit tests | boilerplate Spring Boot stub only | test tree |

### Engineering challenges & solutions
1. Widow vs ESM linkage (`|W`; read-only linked profile; effective progress).
2. Multi-role admin/clerk/director + JWT resource server.
3. Large multipart document uploads (10MB).
4. SmartFilter with IN + arrays (Areef).
5. Dynamic form progress vs stale stored counters (Areef 2026-05).

### Testing, CI/CD & quality
Minimal Spring Boot test; CRA `npm test` available, suite depth unknown. No CI observed. Deepsource bots in FE history.

### Gaps / questions for Areef
- Employer/client (Sainik Board?) and production URL?
- Your title/dates on this engagement?
- Cite as “Sainik ESM Management” vs “ESM Tool”?
- Prod scale (# registered ESM)? Rotate leaked secrets?

---

## Project: AirLog Base (Collidascope snapshot)

- **One-line pitch:** Short licensed snapshot/fork of AirLog prepared for Collidascope adoption (`airlog-base` remote).
- **Status & dates:** Path `Code/NoteOrg/Collidascope/airlog-base`; remote `https://github.com/the-sniper/airlog-base.git`; **2 commits**; last `2026-03-07`. License docs (DOCX) live separately in `Misc/Collidascope-AirLog/`.
- **Links:** `https://github.com/the-sniper/airlog-base.git`.

### Purpose & problem
Commercial/licensing handoff of AirLog into another product suite (Collidascope context per folder + license docs). Full product evidence lives in main AirLog repo (`echo_test` / `the-sniper/airlog`).

### Tech stack / Architecture / Features
Same lineage as AirLog (Next.js + Whisper service + Supabase). Treat main AirLog block as source of truth for engineering claims.

### Quantifiable facts
| Fact | Value | Source |
|------|-------|--------|
| Commits | 2 | git |
| License agreement files | 2 DOCX | `Misc/Collidascope-AirLog/` |

### Gaps / questions for Areef
- Confirm licensee naming rights (Collidascope / Carmel / other)?
- Relationship of `airlog-base` to production AirLog `prod` branch?

---

## Cross-project tech breadth (Skills inventory)

Evidence seen across the scanned repos (not employer-only claims):

**Languages:** TypeScript, JavaScript, Python, Java (8), SQL, Go (career-ops TUI — upstream), Bash, HTML/CSS

**Frontend:** React 18/19, Next.js 14/15 (App Router, Turbopack, standalone), Tailwind CSS 3/4, HeroUI v3, MUI 5/6 (+ X Data Grid/Charts), Radix/shadcn, Framer Motion, GSAP, Three.js + R3F/drei, Recharts, Leaflet, mapbox-gl/maplibre-gl/cobe, Formik/Yup, PWA (next-pwa, custom SW), CRA (ESM Tool), Chart.js (Conduit), `@dnd-kit`, react-webcam, react-pdf / `@react-pdf/renderer`, docx

**Backend & distributed:** Node.js, Next.js API routes / Server Actions / BFF, Convex (+ Convex Auth, crons, file storage), FastAPI, Flask, Django 5, Celery 5, Spring Boot 2.7 / Spring Data JPA / Spring WebFlux, REST, WebSocket (`ws`, binary CDP frames), SSE, JWT (jose, python-jose, jjwt), NextAuth v4/v5, Clerk, OAuth (Google, GitHub, Gmail), MCP (Model Context Protocol), Playwright automation, Redis 7 (Celery), nginx rate limiting, **Protobuf + Buf + ConnectRPC** (Dayspring LaTeX sidecar; Connect / gRPC / gRPC-Web)

**Databases & storage:** PostgreSQL (16; Prisma; SQLAlchemy; Django ORM; Supabase), MySQL (ESM), Supabase (Postgres/Storage/Realtime), **pgvector**, FAISS, Turso/libSQL, IndexedDB, MinIO / S3-compatible (`@aws-sdk/client-s3`), Convex storage, joblib artifacts, Redis

**AI/ML:** OpenAI (`gpt-4o-mini`, `text-embedding-3-small`, newer model id strings in Dayspring/portfolio configs), Anthropic Claude (Sonnet/Haiku/Opus family ids in Dayspring/Hound/portfolio), Google Gemini 2.0 Flash, LangChain, RAG (chunking, embeddings, re-rank, grounding, citations), tool/function calling, agent suites (Hound; Dayspring orchestra), Vercel AI SDK, Ultralytics YOLOv8, PyTorch/torchvision ResNet50, Facebook Prophet, faster-whisper (self-hosted ASR), MediaPipe (offline track), spaCy/NLTK, sentence-transformers/CrossEncoders, RoBERTa NLI, HuggingFace embeddings (`all-MiniLM-L6-v2`), OpenFactCheck solver registry, Calendly tool loop

**Cloud & DevOps:** Vercel (+ cron), Fly.io (Whisper, LaTeX), AWS (ECR/ECS deploy scripts; S3 SDK), GCP (Artifact Registry + Cloud Run Actions), Hugging Face Spaces (+ keep-warm cron), Docker & Docker Compose (multi-service stacks), **Kubernetes + KEDA manifests** (Dayspring LaTeX alternate target; Fly remains documented default), Ansible, Vector (log pipeline), GitHub Actions (selective repos), esbuild, npm packaging (`@klyro/widget`, `@hound-ai/cli`), launchd cron, Buf codegen

**Testing & quality:** Vitest (Klyro 26 tests; portfolio analytics 4), pytest (Conduit 6), Playwright (product + tooling), axe-core, pixelmatch, fault-injection stub (Conduit), ESLint / `next lint`, TypeScript, structured JSON logging; **most personal repos have no automated test suite**

**Integrations seen:** Greenhouse, Lever, Ashby, Workday, Adzuna, Apify, Apollo, Happenstance, Gmail, GitHub, Serper, Calendly, Auth0/JWT (ESM), F5 BIG-IP iControl REST (target + stub)

**Notable absences / caution:** Terraform, Django REST Framework, MongoDB, ELK not found. Kubernetes **is** now evidenced as manifests under `Dayspring/services/latex/k8s/` (with KEDA) — do **not** claim production k8s ops unless Areef confirms a live cluster; Fly is the documented default. Power BI / Tableau / Snowflake / NPS API appear in resume/LinkedIn narratives but are **not evidenced** in the corresponding project trees (AirLog / Forecast My Park) — treat as `UNKNOWN — ask Areef`.

---

## Consolidated gaps for Areef (high priority)

1. **Dayspring** — live URL, usage outcomes, deploy status of latex Fly app (and whether k8s/KEDA was ever exercised), LaTeX one-page hit rate, resume-ready metrics.
2. **AirLog** — canonical domain (`airlog.live` vs `airlog-pro.vercel.app`); commercial license naming rights; Power BI claim source.
3. **Klyro** — `klyro.com` DNS; third-party adoption counts; npm download verification; widget byte size.
4. **Hound** — deploy/publish status; honesty framing for 2-day build burst.
5. **Conduit** — init git/remote; rename; real BIG-IP vs stub-only; dating for resume.
6. **Forecast My Park** — reconcile LinkedIn (NPS/Snowflake/Tableau/CloudFormation) with synthetic-only repo.
7. **GesturePro** — naming, ownership under `khushboohpatel`, metrics, dual-architecture framing.
8. **Fact Checker** — Areef vs Rishit scope; live URLs.
9. **job-scraper vs Dayspring apply** — which narrative is canonical; applied counts.
10. **career-ops** — tool-used vs built (0 Areef commits in upstream clone).
11. **ESM Tool** — employer naming, prod URL, secret rotation, engagement dates/title.
12. **Team vs solo** — EcoMed/GesturePro/Fact Checker contribution boundaries for XYZ bullets.
