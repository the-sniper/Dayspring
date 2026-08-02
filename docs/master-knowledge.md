# Areef Syed — Master Resume Knowledge Base
 
> **Purpose:** Single source of truth for tailoring resumes. Every fact here is traced to the resume PDF (2026-07), the codebase evidence dumps (2026-07), git history, or Areef directly. Items marked ⚠️ are flags: either unverified, code-contradicted, or needing care in how they're claimed. Consolidated open questions are at the end.
 
---
 
## 1. Identity & Contact
 
- **Name:** Areef Syed
- **Location:** Philadelphia, PA 19104
- **Phone:** +1 215-452-8651
- **Email:** areefsyed96@gmail.com (on resume)
- **LinkedIn:** linkedin.com/in/areefsyedfe
- **GitHub:** github.com/the-sniper
- **Portfolio:** areefsyed.com — features an embedded AI copilot (built with his own Klyro product) and a "paste a JD, score it against my skills" tool. Headline: "Full Stack Engineer · Rooted in Design · Powered by AI"
- **Work authorization:** Authorized to work in the U.S., no sponsorship required
 
## 2. Positioning
 
Senior full stack engineer, **6+ years** building data-driven web apps and workflow platforms. Core identity: TypeScript / React / Next.js / Node.js / Python over PostgreSQL & MySQL; distributed REST microservices behind API gateways; CI/CD automation; AI-driven agentic workflows (LangChain, RAG) on AWS and Docker. Self-sufficient with AI engineering tools (Claude Code, Copilot).
 
**Resume variants maintained:** Frontend, Full Stack, Python/backend, and AI/ML-focused. Resume convention: client work appears as *"Client Engagement"* sub-entries under AuctionSoftware in Experience; the Projects section is reserved for personal projects.
 
---
 
## 3. Work Experience (per resume)
 
### Carmel Labs — Forward Deployed Engineer | Mar 2026 – Jul 2026 (⚠️ LinkedIn says "Mar 2026 – Present · 5 mos" — align end date)
*Full-time, Remote (Philadelphia) · TypeScript, Python, Node.js, Next.js, LangChain, Agentic AI, MCP*
 
Resume bullets:
- Built agentic AI infrastructure end to end: a GitHub App automating pull-request checks and AI-driven code review to enforce coding best practices in CI/CD, plus an outside-in monitoring platform with drift detection and anomaly alerting.
- Designed and built a full stack workflow-automation platform (TypeScript + Next.js) integrating enterprise data sources into a unified dashboard with activity logging, pipeline tracking, and team-wide reporting.
 
Additional detail from LinkedIn (richer material for tailoring):
- Built an **AI knowledge assistant** with a knowledge-graph layer, hybrid retrieval, and ingestion from **5 sources** (Gmail, Zoom, Calendar, GitHub, webhooks) — first pipeline to interactive UI in **under 3 weeks**.
- Launched **4 agent-testing products in 4 days** (A/B diffing, public probing, tool auditing, drift detection); shipped end-to-end validation for multi-agent AI pipelines in a coordinated 2-day backend + frontend release.
- Engineered protocol-level support for **MCP (Model Context Protocol) Streamable HTTP transport** — session management, JSON/SSE dual-response handling — validated against production servers.
- Owned monitoring, alerting, and **billing** layers: alert integrations, drift detection, **TTFB SLA enforcement**, usage-based subscription metering, and a public benchmark index (**AOI Index**) for AI agents.
- Technical face of the product: pitched at in-person industry events, ran developer content (LinkedIn/Reddit), built internal GTM tooling.
 
### Carmel Labs — Forward Deployed Engineer Intern | Feb 2026 – Mar 2026 (LinkedIn; not currently on resume)
- Integrated a RAG chatbot with persistent multi-turn session history (coherent context-aware conversations across visitor sessions).
- Token-level streaming over SSE (cut perceived response latency); per-message thumbs up/down feedback loop for response-quality signals.
- Voice input via Web Speech API; runtime language detection + multilingual response support.
- ⚠️ Note overlap: intern period (Feb–Mar 2026) overlaps Collidascope co-op end (Feb 2026) — dates plausible but keep consistent across documents. The RAG/SSE/voice work closely mirrors Klyro's feature set — clarify what was Carmel product work vs. personal Klyro work to avoid double-claiming.
 
### Collidascope VR — Virtual Reality Developer Intern (Co-op) | Sept 2025 – Feb 2026
*Internship, Hybrid (Philadelphia) · Unity, C#, Jira, Webflow*
- Refactored legacy code (−30% redundancy, −35% server ping latency); redesigned the Developer Menu UI for +40% usability; improved maintainability and multiplayer synchronization. (⚠️ measurement basis for percentages still unconfirmed — LinkedIn cites "UX benchmarks" / "fewer build errors" / "player sync performance".)
- From LinkedIn: created custom artifacts/assets for game scenes (visual consistency); helped organize and run the MVP playtest (validated core gameplay pre-launch); **designed the company website in Webflow**.
 
### AuctionSoftware Inc — Senior Frontend Developer | Feb 2019 – May 2024
*JavaScript, React.js, Next.js, Node.js, Python, FastAPI, SQL*
 
⚠️ **Title/location check:** LinkedIn shows the company as "AuctionSoftware.com – DevelopScripts LLC" (Full-time, 5 yrs 4 mos, On-site) split into two roles: **Lead Web Designer & Frontend Developer** (Feb 2021 – May 2024, Greater Chennai Area) and **Web Designer** (Feb 2019 – Feb 2021, Chennai, India). The resume's single "Senior Frontend Developer, Feb 2019 – May 2024" doesn't match either LinkedIn title — background checks verify titles/dates against employer records, so confirm the official employer-of-record title and align resume + LinkedIn.
 
Additional LinkedIn bullets (Lead role): +25% team productivity as team lead (delivery speed/output quality); **+35% user activity via 90% Core Web Vitals score** (performance work to Google's standards); faster sprint cycles via design/dev/client coordination; established code review & QA practices (fewer post-release bugs); client relationship ownership (repeat engagements); mentored junior developers (faster onboarding). Web Designer role: clean UI → efficient React components, cross-device/browser consistency, performance-optimized front-end code.
- Managed end-to-end development of **80+ data-driven web applications**: React front ends, Node.js and Python backend services, REST APIs, integrations with MySQL and PostgreSQL, across Agile sprints tracked in Jira.
- Led front-end development for **Nellis Auctions** (one of the largest secondary marketplaces for Amazon returns); established code-review and peer-review practices; coached engineers on coding standards.
 
**Client Engagement: DeBeers Diamonds — media-heavy auction platform | Mar 2024**
- Built the React front end and real-time data services: bidding APIs through REST microservices, an API gateway, and a backend-for-frontend layer; distributed-systems patterns scaling server-paginated search across a **10k+ item catalog**.
 
**Client Engagement: World Security Services (DP World) — live auction platform | Nov 2023**
- Integrated **WebRTC live video** with real-time data streaming and bidding-trend analytics through a reusable, scalable platform architecture later adopted by multiple Fortune 500 companies.
 
**Tooling across roles:** Git, Jira, Agile/Scrum, code review, peer review, coding standards.
 
## 4. Education
 
- **Drexel University**, Philadelphia, PA — **Masters in AI & Machine Learning**, GPA 3.7, graduation **March 2026**.
- **Bharath Institute of Higher Education and Research**, India — **Bachelor of Technology, Computer Science**, 2014 – 2018, CGPA 7.92/10.
 
---
 
## 5. Projects (evidence-backed)
 
### 5.1 Hound — AI-native E2E test automation platform | Mar 2026 (resume date)
**Pitch:** Platform for authoring, recording, running, and debugging Playwright browser tests with Claude-powered AI steps, live CDP screencast debugging, and production-error → test generation.
**Repo:** github.com/the-sniper/hound · **Solo.** ⚠️ Local-only — no deployed demo URL; committed history is Feb 21–22, 2026 (19 commits) with substantial uncommitted work through Feb 23.
 
**Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript 5.9, Tailwind v4, shadcn/Radix, Prisma 6 + **PostgreSQL** (⚠️ not SQLite — old docs stale), Playwright 1.58 (Chromium), NextAuth v5, WebSocket (`ws`), SSE, Docker Compose (Postgres + MinIO), S3-compatible artifact storage (`@aws-sdk/client-s3`), pixelmatch visual diff, axe-core a11y.
**AI:** Anthropic `claude-sonnet-4` primary, `gpt-4o-mini` fallback; 11-agent AI suite (locator, assertion, failure, recovery, test-generator, step-refiner, copilot, error-to-test, a11y-remediation).
 
**Built (highlights):**
- Live browser view without VNC: CDP `Page.screencast` → binary WebSocket JPEG protocol + SSE fallback, with overlays; separate WS server via `instrumentation.ts` on port 3001.
- Interactive recorder: input forwarding + action recognition + AI step refinement.
- Execution engine (634-LOC executor): retries with exponential backoff, AI recovery agent, video/HAR capture, pause/resume/abort/skip via ExecutionController.
- **30 step types** in schema / 29 handlers (⚠️ ASSERT_VISUAL schema-only, handler not wired) including chaos/network steps (throttle, block, inject latency, simulate error), a11y (axe), security scan, CWV perf.
- 3-tier element resolution: in-memory → branch-aware DB StepCache with TTL → AI locator (cost/flakiness reduction).
- Impact analysis (git diff → scored affected tests → optional auto-run); Sentry & Datadog webhooks → AI test generation from production errors.
- CLI `@hound-ai/cli` (run/list/login) + GitHub Actions template (⚠️ npm publish not verified); Playwright import/export; parallel bulk runs; plugins (Slack/GitHub/Jira/Linear); tiered usage quotas (free = 100 runs/mo).
 
**Verified numbers:** 62 API route files · 20 Prisma models · 30 step types · 11 AI modules · 18 engine modules · ~27.9k LOC (175 TS/TSX files) · 16 app pages · 6 regions defined (⚠️ static metadata, not proven multi-region) · 0 automated tests in repo.
 
**Resume angles:** real-time streaming architecture (CDP/WS/SSE), AI agent orchestration, test-infra domain expertise, schema design (20 models), CI-ready CLI.
 
### 5.2 Klyro (Open Source) — embeddable RAG website copilot | Jan 2026
**Pitch:** Persona-controlled AI copilot trained on a user's GitHub/resume/docs/site via RAG + pgvector, with live tool calling (GitHub, URL fetch, Calendly scheduling), shipped as an embeddable script/npm widget.
**Repo:** github.com/the-sniper/klyro · **Solo** (113 commits, Jan 21 – Mar 12, 2026) · **Live:** klyro-pro.vercel.app (⚠️ klyro.com not confirmed live) · npm `@klyro/widget` — **1,100+ downloads in first week** (owner-reported; cite package name when used).
**Adoption:** Has **real production users — people run the Klyro widget on their own platforms/sites** (owner-reported, 2026-07-29). This upgrades Klyro from "open-source project" to "product in production use by third parties." For XYZ bullets, get defensible numbers from Areef: how many active sites/widgets, chats served, or weekly active widgets (the admin DB — `widgets`, `chat_sessions`, `chat_messages` tables — can supply exact counts).
 
**Stack:** Next.js 14, React 18, TypeScript, Tailwind v4, Framer Motion, GSAP + ScrollTrigger, Three.js/R3F (scroll-driven 3D landing), Supabase Postgres + Storage + **pgvector** (1536-d), OpenAI (`gpt-4o-mini` chat ⚠️ not GPT-4o; `text-embedding-3-small` embeddings), esbuild dual-build widget (IIFE + CJS), nodemailer, unpdf/mammoth ingestion (PDF/DOCX), GA.
 
**Built (highlights):**
- Full RAG pipeline (~1,070-LOC core): embed → retrieve (top-15) → keyword-boost re-rank → prompt with strict/grounded mode + source citations → optional OpenAI tool loop.
- **5 live tools:** fetch latest GitHub projects, repo details, URL content, Calendly event types, available slots (TZ-safe formatting).
- Conversational query rewriting for follow-ups; chunking ~300 tokens / 50 overlap; last-8-message history window.
- **Multi-tenant vector isolation:** `user_id` filter on chunks + filtered `match_document_chunks` RPC (prevents cross-user leakage).
- Embeddable widget (1,592-LOC source, ~152 KB built ⚠️ README's "25KB" is wrong): persistent chat, domain + route allowlists, SPA route detection via history API monkey-patch, inline mode, transcripts.
- Document ingest (PDF/DOCX/TXT/MD/URL → chunks → embeddings); admin dashboard (persona editor + presets, knowledge base, test chat, conversations inbox, multi-widget integrations, logo upload); signup with email OTP (rate-limited), cookie sessions.
- **26 Vitest unit tests** (embeddings chunking, RAG context, tool helpers, session cookies) — the one project with a test suite.
 
**Verified numbers:** 113 commits · 17 API routes · 17 SQL migrations · ~20k LOC · 1536-d embeddings · 5 tools · 26 tests · 1,100+ first-week npm downloads (owner report).
 
**Resume angles:** RAG/vector search from scratch, multi-tenant data isolation, open-source npm distribution with real adoption, tool-calling agents, widget/SDK engineering, creative 3D marketing site.
 
### 5.3 AirLog — voice-first user-testing platform | Nov 2025 (resume date; ⚠️ first commit Dec 12, 2025)
**Pitch:** QA/product teams run structured scene-based test sessions; tester feedback captured as voice/text, auto-transcribed (self-hosted Whisper), AI-classified, summarized, and exported as PDF reports. Multi-tenant SaaS (company admin / super admin / tester).
**Repo:** github.com/the-sniper/airlog · **Solo** (282 commits, Dec 2025 – Mar 2026) · **Live:** airlog-pro.vercel.app (⚠️ resume says airlog.live — confirm which is canonical) + Fly.io Whisper service.
**Adoption:** **Commercially licensed — the company Areef was working for adopted AirLog and took a separate license to use it within their product suite** (owner-reported, 2026-07-29). This is a strong, rare signal: a solo side project converted into a B2B license. For resume use, confirm with Areef: which company (⚠️ presumably Carmel Labs — don't assume), license type/terms, seats or teams using it, and whether the company can be named publicly. Safe framing until confirmed: "commercially licensed by an enterprise customer for use within their product suite."
 
**Stack:** Next.js 14, React 18, TypeScript, Tailwind, Radix, Supabase (Postgres + Storage + Realtime), OpenAI `gpt-4o-mini`, self-hosted **faster-whisper** on Fly.io Docker (2 CPU/4GB; ⚠️ not "OpenAI Whisper API"), Flask microservice, JWT (jose) 3-realm auth, @react-pdf/renderer, nodemailer, PWA, Vercel cron, Three.js landing, recharts analytics.
 
**Built (highlights):**
- **Durable client-first transcription pipeline:** audio persisted to IndexedDB before network (423+498-LOC queue), retries (max 5), recovery after OS-killed recordings; voice recorder with Wake Lock, pause/resume, background-stop detection.
- Self-hosted Whisper ASR service (Flask + faster-whisper, VAD, int8 CPU) behind a retrying Next.js proxy (3 attempts / 60s timeout); Fly auto-stop/start for cost.
- **Three-tier JWT auth middleware** (super admin / company admin / tester cookie realms); multi-tenant companies migration (single-admin MVP → org SaaS); tester note isolation for bias prevention.
- GitHub integration: per-company OAuth; PR merge → LLM+regex "what to test" extraction → time-window session matching with orphan backlog.
- AI classification (5 categories + keyword fallback), per-note & session summaries, polls with realtime results, shareable public report links, PDF session reports.
- Admin analytics suite, service health/cost monitoring (OpenAI, Fly, Supabase, SMTP), usage metering, audit logs, 14+ transactional email templates, OTP verification, daily cron notification checker.
 
**Verified numbers:** 282 commits · ~70.9k LOC (256 TS/TSX files) · **107 API routes** (164 HTTP handlers) · 55 SQL migrations · 29 tables · 5 note categories · 0 automated tests. ⚠️ Resume bullet mentions **Power BI** — not evidenced in the AirLog repo (recharts + PDF + email are); per Areef's direction the AirLog↔Power BI reporting exists as built/in use — treat as his call, but be ready to speak to it in interviews.
 
**Resume angles:** ETL/audio pipeline framing (ingest → transcribe → classify → persist → report), offline-resilient client engineering, multi-tenant SaaS architecture, self-hosted ML serving, GitHub workflow integration.
 
### 5.4 Fact Checker — AI claim verification pipeline | Mar 2025 – Apr 2026 (⚠️ LinkedIn says Feb–Mar 2025, associated with Drexel; repo first commit Mar 17, 2025 with work through Apr 2026 — LinkedIn window predates the repo)
**Pitch:** Full-stack app that extracts claims from text, retrieves web evidence (Serper), and returns per-claim verdicts, reasoning, corrections, and citations via a pluggable multi-stage solver pipeline (Factool / FactCheckGPT / RARR).
**Repo:** github.com/eparirishit/fact-checker · **Team of 2** (⚠️ Areef 11 of 38 commits; Rishit majority — scope claims to actual contributions, confirm split) · Demo Loom in README; live URLs unconfirmed.
 
**Stack:** Next.js 15 + React 19 + MUI frontend with BFF proxy; FastAPI backend; vendored OpenFactCheck orchestrator with **25 registered solvers** via decorator registry; async OpenAI with exponential backoff + `asyncio.gather` batching; Serper.dev search; optional Azure Bing; CrossEncoders + RoBERTa NLI (alternate path); spaCy/NLTK.
**Deploy targets:** Docker Compose, GCP Cloud Run (8Gi/4CPU via Actions workflow), Hugging Face Spaces (+ 6-hour keep-warm cron), Vercel.
 
**Verified numbers:** 8,001 Python LOC (86 files) · 25 solvers · 3 API routes · 6,474 lines of benchmark JSONL (7 datasets, offline) · 0 tests.
**Resume angles:** LLM pipeline orchestration, plugin architecture, async rate-limit engineering, multi-cloud deployment matrix.
 
### 5.5 GesturePro — ASL sign-to-text PWA | Apr – Jun 2025 (⚠️ LinkedIn says Mar–May 2025, associated with Drexel; repo commits Apr 15 – Jun 10)
**Pitch:** Webcam ASL translation to text (+ TTS): YOLOv8 inference server-side, sentence building from noisy detections, dual auth, installable PWA; WLASL data pipeline and alternate MediaPipe+TCN/LSTM training track.
**Repo:** github.com/khushboohpatel/gesturepro · **Team of 4** — Areef led with **35 of 56 commits** (⚠️ confirm per-person scope; also confirm resume naming: "GesturePro" vs "Interactive Sign Language Translator").
 
**Stack:** Next.js 15 PWA (next-pwa), React 18, MUI, NextAuth (Google OAuth) + FastAPI JWT dual auth with unified middleware, react-webcam, FastAPI + SQLAlchemy + PostgreSQL 16, Ultralytics **YOLOv8** (23 classes, imgsz 640), Docker Compose (db/backend/frontend + healthchecks), browser SpeechSynthesis TTS, WLASL dataset pipeline (yt-dlp, MediaPipe keypoints).
 
**Built (highlights):** SentenceBuilder turning per-frame detections into coherent sentences (3-frame stability, 0.5 conf floor, 1s word debounce); 1.5s frame-polling protocol with session-scoped state; 16 API endpoints; 4-step signup + Google OAuth; PWA install/splash; WLASL filter/download/preprocess (468 videos → 468 keypoint sequences, 320/78/70 split).
**Verified numbers:** 56 commits · 23 production classes · 16 endpoints · ~5.3k app LOC · WLASL 2,000 glosses / 21,083 instances source dataset. ⚠️ No committed mAP/accuracy metrics — don't quote model performance without training logs. ⚠️ LinkedIn claims "4,000+ training samples" and a "dual AI architecture (YOLOv8 + LSTM/TCN)" — repo shows 468 videos/keypoint sequences and the LSTM/TCN track **not wired to the API**; confirm the 4,000+ figure's source and frame the dual architecture as "trained/prototyped" not shipped.
 
### 5.6 EcoMed AI — hospital waste classification + sustainable procurement | Mar 2025 (Philly Codefest '25 hackathon, 6-day sprint; on LinkedIn as "AI-Powered Healthcare Sustainability Platform", associated with Drexel)
**Pitch:** Classifies medical waste images into disposal bins (fine-tuned ResNet50, 7 classes → 4 bin colors) and recommends lower-carbon supply alternatives by matching hospital BOMs against a **3,009-product LCA catalog** (FAISS + HuggingFace embeddings + Gemini 2.0 Flash rerank).
**Repo:** github.com/the-sniper/ecomedai · **Team of 4** — Areef 13 of 36 commits (frontend + unified backend gateway + SustainableCoach flow). ⚠️ Hackathon placement/awards and model accuracy unrecorded — confirm before claiming.
 
**Stack:** Next.js 15 + MUI 6 + Recharts frontend; FastAPI with two mounted sub-apps; PyTorch/torchvision ResNet50; LangChain + FAISS + `all-MiniLM-L6-v2`; Gemini via `ChatGoogleGenerativeAI`; startup preloading to kill cold-start.
**Resume angles:** applied CV + RAG-style retrieval under hackathon time pressure; healthcare sustainability domain.
 
### 5.7 Forecast My Park — national park crowd forecasting | Jul 2025 (⚠️ LinkedIn says May–Jun 2025, associated with Drexel; repo's single commit is Jul 13, 2025)
**Pitch:** Full-stack visitor forecasting: per-park Prophet models (10+ regressors: weather, holidays, school calendar, gas prices; custom seasonalities; 80% CI; time-series cross-validation computing MAE/MAPE/RMSE), FastAPI ML service, Next.js map/chart dashboard (Leaflet + Recharts) behind a BFF.
**Repo:** github.com/the-sniper/forecast_my_park · **Solo** (single squashed commit) · AWS ECR/ECS deploy script + nginx rate-limited reverse proxy; live URL unconfirmed.
 
⚠️ **Critical honesty flag:** training data is **synthetic** (simulated weather/attendance for 30 parks, ~38.7k records) — never present this as real NPS data. Safe phrasing: "forecasting system with a synthetic multi-feature dataset simulating 30 parks" or focus on the ML/serving engineering.
⚠️ **LinkedIn project description vs repo evidence:** LinkedIn claims real-time NPS API integration, Snowflake data warehouse + Tableau dashboards, AWS CloudFormation, and "39,000+ visitor records" — the repo shows none of these (no NPS/weather API at runtime, no Snowflake/Tableau/CloudFormation configs; ~38.7k synthetic records ≈ the 39k figure). If the Snowflake/Tableau/NPS work exists outside this repo, get the evidence; otherwise align the LinkedIn text to the repo before recruiters cross-check. "18+ features" ≈ the 18 feature columns in `visitor_data` (defensible).
**Verified numbers:** 30 parks generated · 19 committed Prophet models · 9 ML API endpoints · 1–365-day forecast horizon · 24h in-memory model cache · ~3.8k LOC.
**Resume angles (already on resume as "Forecast My Park"):** time-series ML at scale (per-entity models), model serving with caching + on-demand training, BFF pattern, AWS containerized deploy.
 
### 5.8 Conduit — self-service F5 BIG-IP control plane | Jul 2026 (file mtimes Jul 25–29; ⚠️ no git history — confirm timeline)
**Pitch:** Django control plane for F5 BIG-IP load balancers: operators view LTM pool health/connections and drain / force-offline / enable pool members without touching the BIG-IP console. All device I/O is deferred to Celery so slow/flaky iControl REST calls never block web requests — Django reads a Postgres cache; workers do the talking.
**Repo:** ⚠️ not initialized in git, no remote (local dir `poolside` — rename to Conduit pending in code strings) · **Local-only** (compose stack on :8000; Ansible playbook exists but no live host confirmed) · Built expressly to cover Python-role skills (Django, Celery, Redis) for backend JDs.
 
**Stack:** Python 3.12 (container), **Django 5.1**, **Celery 5.x** (worker + beat), **Redis 7** (broker `/0` + results `/1`), PostgreSQL 16, psycopg3, requests, python-json-logger, Chart.js 4.4 (CDN), gunicorn (⚠️ declared but compose runs `runserver` — prod story unfinished), pytest, Docker Compose (**7 services**: db, redis, f5stub, web, worker, beat, vector), **Vector 0.40** log pipeline, **Ansible** deploy (installs Docker, rsyncs to `/opt/poolside`, `docker_compose_v2`). ⚠️ README says "DRF-style JSON views" but DRF is not installed — plain `JsonResponse`; don't claim DRF.
 
**Built (highlights):**
- **iControl REST client** (142 LOC): token auth, URL-encoded `~Partition~name` refs, nested `entries`/`nestedStats` stats parsing (`serverside.curConns`, availability state), PATCH payloads for drain/offline/enable — unit-tested.
- **Device isolation pattern:** views never call F5; they enqueue Celery tasks and read the Postgres cache. Beat syncs every 15s; mutating task `apply_member_state` autoretries on `F5ConnectionError` (backoff, max 4 retries, 60s cap) and resyncs on success. Transport (retryable 5xx/network) vs application (4xx) errors split into two exception types.
- **Async operation audit trail:** `Operation` rows pending→running→succeeded|failed with Celery task IDs; status API polled by the UI until terminal.
- **Live dashboard:** up/down/conns strip, Chart.js 15-min connection time series (15s buckets from `MemberSample`), per-member action tiles, health state-change feed (transition detection at sync time), 3s polling; plus a manual SSR control panel at `/pools`.
- **Flaky F5 stub server** (stdlib HTTP): 2 pools / 5 members, configurable 503 flake rate (15%) and health flap rate (6%), simulated latency, connection random-walk — exercises the retry path end-to-end locally.
- **Observability:** structured JSON events (`f5.member.transition`, `f5.sync.completed`, `f5.operation.*` with `latency_ms`) → shared log volume → Vector remap/filter → console + archive sinks.
- 5 Django models (Pool, Member, Operation, MemberSample, StateChange), Django admin for all, env-based config, **6 pytest tests passing** (F5 client: ref encoding, action payloads, stats parsing, unknown action).
 
**Verified numbers:** 7 HTTP routes · 5 models · 2 Celery tasks · 7 compose services · 893 Python LOC · 6 tests passing · 15s sync / 3s poll / 15-min chart window · retry max 4, backoff cap 60s.
 
⚠️ **Honesty rails:** exercised only against the **stub** — no evidence of a real BIG-IP, staging, or production use; local-only with no CI, no auth gating on the panel, no coverage report. Safe framing: "control plane for F5 BIG-IP built against the iControl REST contract, with a fault-injecting device simulator" — don't claim production F5 operations or real traffic without Areef confirming.
 
**Resume angles (Python/backend JDs):** Django + Celery + Redis async task architecture, retry/backoff design, REST client engineering against a real vendor API contract, Docker Compose multi-service orchestration, Ansible deploy automation, structured logging + Vector pipeline, fault-injection testing.
 
---
 
## 6. Skills Inventory (merged: resume + all repos)
 
**Languages:** TypeScript, JavaScript, Python, SQL, C# (Unity co-op), Bash, GLSL (config-wired), HTML/CSS
**Frontend:** React 18/19, Next.js 14/15 (App Router, Turbopack, standalone), Tailwind CSS 3/4, MUI 5/6 (+ X Data Grid/Charts), Radix UI, shadcn/ui, Emotion, styled-components, Framer Motion, GSAP, Three.js + R3F/drei, Recharts, Leaflet, @dnd-kit, react-webcam, Formik/Yup, PWA (service workers, manifests, install flows)
**Backend & distributed:** Node.js, FastAPI, Flask, **Django 5** (Conduit), **Celery 5** (worker + beat, retry/backoff patterns), Next.js API routes / BFF pattern, REST microservices, API gateway, WebSocket (ws, binary protocols), SSE, WebRTC (DP World), JWT (jose, python-jose), NextAuth v4/v5, OAuth (Google, GitHub), bcrypt, Zod, Pydantic, SQLAlchemy 2, Prisma 6, Django ORM, nodemailer, multipart uploads, health checks, rate limiting (nginx)
**Databases & storage:** PostgreSQL (incl. RDS; 16 in Conduit/GesturePro), MySQL (RDS), Supabase (Postgres/Storage/Realtime), **pgvector**, FAISS, IndexedDB, MinIO / S3-compatible, joblib artifacts, **Redis 7** (Celery broker + result backend — Conduit)
**AI/ML:** LangChain, RAG (embeddings, chunking, re-ranking, strict grounding, citations), hybrid retrieval + knowledge-graph layer (Carmel Labs), **MCP — Model Context Protocol** (Streamable HTTP transport, session management, JSON/SSE dual-response — Carmel Labs), agent testing/evaluation (A/B diffing, probing, tool auditing, drift detection, AOI benchmark index — Carmel Labs), OpenAI (GPT-4o-mini, text-embedding-3-small), Anthropic Claude (Sonnet 4), Google Gemini 2.0 Flash, tool/function calling, AI agent suites, PyTorch, torchvision (ResNet50), Ultralytics YOLOv8, Facebook Prophet, faster-whisper (self-hosted ASR), MediaPipe, spaCy, NLTK, sentence-transformers/CrossEncoders, RoBERTa NLI, HuggingFace embeddings, Web Speech API (voice input), runtime language detection/multilingual responses
**Cloud & DevOps:** AWS (S3, ECR, ECS), GCP (Artifact Registry, Cloud Run), Vercel, Fly.io, Hugging Face Spaces, Docker & Docker Compose (multi-stage; 7-service stack in Conduit), Podman Compose, **Ansible** (host provisioning + compose deploy), **Vector** (log shipping/transforms), GitHub Actions, nginx, esbuild, npm package publishing, CI/CD pipelines, ETL pipelines, F5 BIG-IP iControl REST (integration target)
**Testing & quality:** Playwright (deep — built a testing product on it), Vitest, pytest (Conduit), axe-core (a11y), pixelmatch (visual regression), fault-injection testing (Conduit's flaky F5 stub), Core Web Vitals budgets, ESLint, TypeScript strict, structured JSON logging, code review / peer review practices. ⚠️ Committed test suites: Klyro (26 Vitest) and Conduit (6 pytest) only — claim "testing" via those plus Hound's product domain, not blanket TDD.
**Analytics/BI:** Power BI (per resume/AirLog reporting — see §5.3 flag), Tableau (⚠️ LinkedIn ties it to Forecast My Park where the repo shows none — see §5.7 flag), Recharts dashboards, Google Analytics
**Design/other:** Webflow (Collidascope company site), UI/UX design background (Lead Web Designer role, "Rooted in Design" positioning), usage-based billing/metering + SLA enforcement (Carmel Labs), GTM/developer-relations experience (Carmel Labs)
**Process:** Git, Jira, Agile/Scrum, Confluence-style docs, coding standards, mentoring/coaching engineers
 
**Notable absences (don't claim):** Kubernetes/Terraform configs not found in any repo (⚠️ resume JD-matching should treat K8s as gap unless Areef confirms other experience); Django REST Framework not used anywhere (Conduit uses plain JsonResponse — don't say DRF); .NET, MongoDB, Cloud Foundry, ELK not evidenced.
 
---
 
## 7. Discrepancies & Open Questions (resolve with Areef before use)
 
**Conflicts to resolve:**
1. AirLog live URL: resume says `airlog.live`, repo evidence shows `airlog-pro.vercel.app` — which is canonical/DNS'd?
2. AirLog start date: resume Nov 2025 vs first commit Dec 12, 2025.
3. Power BI in AirLog: on resume, not in repo (see §5.3).
4. Hound date: resume Mar 2026 vs committed work Feb 2026 (minor; uncommitted work continued).
5. GesturePro naming (GesturePro vs Interactive Sign Language Translator) and why repo lives under `khushboohpatel`.
6. Fact Checker canonical repo (`eparirishit` vs `the-sniper` clone URL) and Areef's precise scope vs Rishit's.
7. Conduit: no git yet — initialize + push, confirm repo URL and resume dating (file mtimes say Jul 2026); code strings still say `poolside` (rename pending); ever pointed at a real BIG-IP or staging host, or stub-only? Employer context (personal vs Carmel Labs)? gunicorn declared but compose uses `runserver` — intended prod setup?
8. **AuctionSoftware title:** resume "Senior Frontend Developer" vs LinkedIn "Lead Web Designer & Frontend Developer" (2021–2024) / "Web Designer" (2019–2021), Chennai — confirm employer-of-record title and align resume + LinkedIn (background-check risk).
9. **Carmel Labs end date:** resume Mar–Jul 2026 vs LinkedIn "Present"; also decide whether to add the Feb–Mar 2026 FDE internship to the resume (it adds a clean promotion story: intern → full-time).
10. **Forecast My Park LinkedIn description** claims NPS API, Snowflake, Tableau, CloudFormation not evidenced in the repo — reconcile (see §5.7).
11. **Project date mismatches vs LinkedIn:** Fact Checker (LinkedIn Feb–Mar 2025 vs repo Mar 2025+), GesturePro (Mar–May vs repo Apr–Jun), Forecast My Park (May–Jun vs repo Jul) — pick one dating source and align resume, LinkedIn, and portfolio.
12. Carmel intern RAG-chatbot work vs Klyro overlap — clarify boundaries so the same feature set isn't claimed twice as employer work and personal project.
 
**Unverified metrics (get numbers or drop):** AirLog license specifics — which company (presumably Carmel Labs?), license terms, teams/seats, and whether the licensee can be named (adoption itself confirmed by Areef 2026-07-29); AirLog usage counts (companies/sessions/notes); Klyro adoption counts — active third-party sites/widgets, chats served (real-user adoption confirmed by Areef 2026-07-29) — and klyro.com DNS; Hound npm publish status + Phase 10 shipped %; GesturePro YOLO mAP; EcoMed classifier accuracy + hackathon placement; Forecast My Park ECS production use + real MAPE/MAE; Collidascope % improvements' measurement basis (−30%/−35%/+40%).
 
**Standing honesty rails for the tailoring project:** Forecast My Park data is synthetic; Hound is not deployed; widget is ~152KB not 25KB; models are `gpt-4o-mini` not GPT-4o; Hound uses PostgreSQL and 30 step types (newer than stale docs); Conduit ran against a fault-injecting stub, not a real BIG-IP, and has no DRF; automated tests exist only in Klyro (26) and Conduit (6).