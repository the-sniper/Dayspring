# Setup runbook

Everything still pending across the features built so far, in the order that
gets you working software fastest. Verified against the repo, not from memory.

## Already done — no action needed

- All code committed and tracked.
- `npm install` run; the Connect/protobuf dependencies are present.
- Convex schema pushed — `resumeAssets` and `applyAnswers` are in the generated
  API, so `convex dev` picked up the new tables and columns.
- Résumé `.tex` template (13.4k chars) and Master Knowledge Base (33.3k chars)
  saved in Settings.
- `npx tsc --noEmit` is clean.

---

## Local

### 0. CLI credentials — needed before any script that touches Convex

Every `scripts/*.ts` that reads or writes your data calls `prepareCli()`, which
signs in to Convex as a real user, because all the Convex functions are
user-scoped. Without credentials you get:

```
Background runs need a signed-in user — create an account at /signin, then set
DAYSPRING_CLI_EMAIL and DAYSPRING_CLI_PASSWORD
```

**If you signed in with Google there is no password to give it.** Use the shared
secret instead — one value in two places:

```sh
# 1. on the Convex deployment
npx convex env set DAYSPRING_CLI_SECRET "$(openssl rand -hex 32)"
npx convex env get DAYSPRING_CLI_SECRET      # copy this

# 2. in .env.local
DAYSPRING_CLI_EMAIL=you@example.com          # the email on your account
DAYSPRING_CLI_SECRET=<the value you just copied>
```

`DAYSPRING_CLI_PASSWORD` still works, but only for accounts created with
email/password.

> **Do not** try to fix a Google account by signing up with a password on the
> same address. This app's `Password` provider has no email verification, so
> Convex Auth treats it as untrusted and creates a **second user** rather than
> linking. Scripts would then run against an empty account and report "0 rows"
> as though they had worked.

This gates more than it looks like: `triage-us`, `daily`, `pull-jobs`, `seed`,
`apply`, `orchestra`, **and `scripts/mcp-server.ts`** — so if the Dayspring MCP
tools have never worked for you in Claude Code, this is why.

Not needed for the three `check-*` scripts below: those are pure logic with no
Convex access, which is why they pass on a bare checkout.

### 1. Sanity checks (30 seconds, free, no API calls, no credentials)

```sh
npx tsx scripts/check-apply-logic.ts    # answer-bank classes + reusability
npx tsx scripts/check-us-location.ts    # US-only post filter
npx tsx scripts/check-latex-resume.ts   # page-count parsing, relocation line
```

### 2. Clean out the LinkedIn feed

Needs step 0.

The US-only filter runs on new pulls, but the ~295 posts already in the feed
predate it.

```sh
npx tsx scripts/triage-us.ts            # dry run — prints what it would file away
npx tsx scripts/triage-us.ts --apply
```

Cheap by design: the regex verdict decides most rows for free and only genuinely
ambiguous ones cost a model call, batched 15 at a time.

### 3. Enable the MCP apply loop

Add to `.env.local`:

```sh
DAYSPRING_AGENT_SECRET=$(openssl rand -hex 32)
```

Restart `npm run dev`. Unset, `/api/apply/agent` returns 404 and the `apply_*`
MCP tools stay dark by design. Then from Claude Code in this repo:

```
apply_open   → apply_snapshot → apply_fill_field → apply_snapshot again
```

There is deliberately no approve-or-submit tool. Submitting stays a click in the
UI.

### 4. First Workday sign-in (one-time, per tenant)

Open apply-assist on any Workday job. The browser now uses a persistent profile
at `data/browser-profile`, which does not exist yet — it's created on the first
run. Sign into the tenant by hand that once. Every later application to that
tenant takes the autofill path instead of the manual one.

### 5. Verify the production build

```sh
npm run build
```

**This is the one real gap in what I could check.** The desktop bridge runs Linux
and Next tries to download a Linux SWC binary it has no network for, so I was
never able to run a build. `tsc --noEmit` is clean, but that doesn't catch
client/server boundary problems.

---

## Cloud

### 6. Deploy the LaTeX sidecar — highest payoff item here

Without it there is no PDF and no page count, which means the length loop (the
main thing separating this from the old résumé generator) can't run.

Run from the **repo root**, not `services/latex` — the image needs both
`services/latex/` and `shared/gen/`, so the build context must be the root.

```sh
fly launch --no-deploy --config services/latex/fly.toml
fly secrets set LATEX_SERVICE_SECRET="$(openssl rand -hex 32)" --config services/latex/fly.toml
fly deploy --config services/latex/fly.toml
```

Then in `.env.local`:

```sh
DAYSPRING_LATEX_SERVICE_URL=https://dayspring-latex.fly.dev
DAYSPRING_LATEX_SERVICE_SECRET=<the same value you set above>
```

Restart dev, reload Settings. The Resume sources panel should switch from
"No LaTeX backend configured" to naming the sidecar.

Smoke test it directly:

```sh
curl -s https://dayspring-latex.fly.dev/health
curl -s -X POST https://dayspring-latex.fly.dev/dayspring.latex.v1.LatexService/Compile \
  -H "content-type: application/json" \
  -H "authorization: Bearer $LATEX_SERVICE_SECRET" \
  -d '{"latex":"\\documentclass{article}\\begin{document}hi\\newpage two\\end{document}"}' \
  | head -c 200
```

Expect `"pages":2` and a base64 `pdf` field. **The Docker image build is
untested** — I have no Docker here. The tectonic install line comes from their
official docs and the CLI form is confirmed, but the first `fly deploy` is where
the image is actually proven.

**Local alternative if you'd rather not deploy:** `brew install tectonic`, then
reload Settings — no restart needed. That only fixes your machine, which is why
the service is the recommendation.

### 7. Vercel env (only if you host Dayspring)

Set the same values in the Vercel dashboard:

```
DAYSPRING_LATEX_SERVICE_URL
DAYSPRING_LATEX_SERVICE_SECRET
DAYSPRING_AGENT_SECRET
```

Apply-assist stays local-only regardless; `isHosted()` gates it, and hosted users
now get a user-appropriate message rather than "brew install tectonic".

---

## Optional — the résumé-evidence work

Neither is needed for the product to work. Both exist so the experience is real
and defensible.

### 8. Kubernetes, locally, at zero cost

```sh
kind create cluster --config services/latex/k8s/kind.yaml
docker build -f services/latex/Dockerfile -t dayspring-latex:local .   # context = repo root
kind load docker-image dayspring-latex:local --name dayspring
kubectl apply -f services/latex/k8s/deployment.yaml
kubectl -n dayspring create secret generic latex-service \
  --from-literal=secret="$(openssl rand -hex 32)" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n dayspring rollout status deploy/latex
kubectl -n dayspring port-forward svc/latex 8080:80 8081:8081
```

Point Dayspring at it with `DAYSPRING_LATEX_SERVICE_URL=http://localhost:8080`.

Scale-to-zero is a separate step (`k8s/keda.yaml`) and needs KEDA plus its HTTP
add-on installed first. Remove the HPA from `deployment.yaml` before applying it
— KEDA owns its own HPA and two controllers fighting over one Deployment's
replica count is a bad afternoon.

Needs `docker`, `kind`, and `kubectl` on your Mac (`brew install kind kubectl`,
plus Docker Desktop or Colima).

### 9. Exercise the gRPC path

The sidecar serves gRPC proper on a second port, because a Node plaintext
`http2` server cannot also serve HTTP/1.1.

```sh
DAYSPRING_LATEX_PROTOCOL=grpc
DAYSPRING_LATEX_GRPC_URL=http://localhost:8081   # or the Fly h2c endpoint
```

Generate a résumé and confirm it still works. Leave it on `connect` for normal
use — that's the path that works from Vercel and through any proxy.

`npm run proto` regenerates the protobuf output, and is only needed if you edit
`proto/dayspring/latex/v1/latex.proto`.

---

## Where each env var goes

Four separate environments, and they are not interchangeable. Derived from what
the code actually reads, not from memory:

- **`.env.local`** — your machine. Read by `npm run dev` and every `scripts/*.ts`.
- **Convex deployment** (`npx convex env set`) — read by code inside `convex/`.
  `.env.local` is invisible here; these run on Convex's servers.
- **Fly secrets** (`fly secrets set --config services/latex/fly.toml`) — read by
  the sidecar.
- **Vercel** — only if you host the Next app.

| Var | .env.local | Convex | Fly | Vercel |
|---|:--:|:--:|:--:|:--:|
| `DAYSPRING_CLI_SECRET` | ✅ | ✅ | — | if cron |
| `DAYSPRING_CLI_EMAIL` | ✅ | — | — | if cron |
| `DAYSPRING_CLI_USER_ID` | ✅ | — | — | if cron |
| `DAYSPRING_LATEX_SERVICE_URL` | ✅ | — | — | ✅ |
| `DAYSPRING_LATEX_SERVICE_SECRET` | ✅ | — | — | ✅ |
| `LATEX_SERVICE_SECRET` | — | — | ✅ | — |
| `DAYSPRING_AGENT_SECRET` | ✅ | — | — | ❌ |
| `DAYSPRING_APP_URL` | optional | — | — | — |
| `DAYSPRING_LATEX_PROTOCOL` / `_GRPC_URL` | optional | — | — | optional |
| `DAYSPRING_BROWSER_PROFILE` / `_CDP_URL` / `_TEX_ENGINE` | optional | — | — | ❌ |
| `CRON_SECRET` | — | — | — | ✅ |
| `DAYSPRING_VAULT_KEY` | ✅ | — | — | ✅ |

Three things that catch people:

**`DAYSPRING_CLI_SECRET` lives in two places and they must match.** The Convex
copy is what the `cli` auth provider compares against; the `.env.local` copy is
what the client sends. Set the Convex one with
`npx convex env set DAYSPRING_CLI_SECRET "<value>"`.

**`LATEX_SERVICE_SECRET` (Fly) and `DAYSPRING_LATEX_SERVICE_SECRET` (app) are the
same value under two names.** Different names because one is the service's own
config and the other is a client credential. If they drift you get a 401 that
now says exactly that.

**Convex dev and prod are separate deployments with separate env.** `npx convex
env set` targets whichever you're pointed at. If you ever run
`npx convex deploy`, set it on prod too: `npx convex env set --prod ...`.

`DAYSPRING_AGENT_SECRET` is marked ❌ for Vercel on purpose: apply-assist opens a
browser on the machine running Dayspring, and `isHosted()` refuses to start a
session there regardless. Setting it hosted just exposes an endpoint that can
only return errors.

## Shortest path to seeing it all work

```sh
# 1. npx convex env set DAYSPRING_CLI_SECRET ... ; same value + DAYSPRING_CLI_EMAIL
#    in .env.local  (unblocks every script, including the MCP server)
npx tsx scripts/triage-us.ts --apply            # clean the feed
fly deploy --config services/latex/fly.toml     # from repo root
# 2. .env.local: DAYSPRING_LATEX_SERVICE_URL + _SECRET + DAYSPRING_AGENT_SECRET
npm run build                                   # the check I couldn't run
```

Then tailor a résumé against a real job and look at the score, the gap list, and
whether the page badge says "fills 2 pages" — that last one is the whole point of
the sidecar.
