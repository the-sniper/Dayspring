# LaTeX compile sidecar

Compiles a `.tex` to PDF and reports the real page count, so **nobody installs a
TeX distribution** — not you, not any user of a hosted deployment.

## Why a service and not an npm package

There isn't one. Every npm package that looks like a LaTeX compiler either
shells out to a locally installed binary (`node-latex`, `node-latex-pdf`) or is
an unmaintained Emscripten port. The WASM engines that genuinely work
([SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX),
[texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)) are browser-only,
and the maintained one ships 32MB of WASM plus 90–400MB of data packages.

A container running `tectonic` is a few hundred MB, deployed once, and keeps the
page-count feedback loop server-side where the rest of the pipeline lives.

## The interface

Defined in [`proto/dayspring/latex/v1/latex.proto`](../../proto/dayspring/latex/v1/latex.proto)
and served with [Connect](https://connectrpc.com), which means one handler
answers three wire protocols:

| Protocol | Port | Used by |
|---|---|---|
| Connect over HTTP/1.1 | `PORT` (8080) | **the default** — works from Vercel, through any proxy, and with `curl` |
| gRPC-Web over HTTP/1.1 | `PORT` (8080) | proxies that mangle h2c |
| gRPC over h2c | `GRPC_PORT` (8081) | real gRPC: binary framing, no base64 on the PDF, trailers and status codes |

**Two listeners, deliberately.** Node's plaintext `http2` server cannot reliably
also serve HTTP/1.1 (`allowHTTP1` works for TLS + ALPN, not for h2c with prior
knowledge), so one port genuinely cannot serve both gRPC and plain JSON. That
was verified, not assumed.

Pick the protocol from Dayspring with `DAYSPRING_LATEX_PROTOCOL`
(`connect` | `grpc` | `grpcweb`). The call site is identical either way, which
is the actual argument for defining this boundary in protobuf rather than
hand-rolling JSON.

Regenerate after editing the proto: `npm run proto` (needs `buf`, already a
devDependency). Generated output is committed to `shared/gen/` so neither the
Docker build nor Vercel needs the buf toolchain.

Every RPC checks `Authorization: Bearer $LATEX_SERVICE_SECRET`; the service
refuses to start without it, because an open compile endpoint on a public URL is
a free CPU faucet. `GET /health` is separately unauthenticated and reports
liveness only — a kubelet probe or a Fly healthcheck can't present a bearer
token or speak Connect.

## Deploy: Fly.io (the default)

```sh
cd services/latex
fly launch --no-deploy          # accept the existing fly.toml
fly secrets set LATEX_SERVICE_SECRET="$(openssl rand -hex 32)"
fly deploy
```

Then in Dayspring's `.env.local` and your Vercel env:

```sh
DAYSPRING_LATEX_SERVICE_URL=https://dayspring-latex.fly.dev
DAYSPRING_LATEX_SERVICE_SECRET=<the same value>
```

Scale-to-zero is on by default: this compiles a handful of resumes a day, so an
always-on machine is waste. The Dockerfile pre-warms tectonic's package cache at
build time so a cold start is a container boot rather than a TeX Live download.

## Deploy: Kubernetes

Manifests in [`k8s/`](k8s). Fly stays the recommended path — it gives
scale-to-zero for free, which on Kubernetes you have to build yourself. The k8s
target exists as an equally supported alternative, and because assembling
scale-to-zero by hand is the part actually worth understanding.

Local cluster, no cloud account, no cost:

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

`deployment.yaml` ships an HPA that scales 1..3 — a plain HPA **cannot** scale to
zero. [`k8s/keda.yaml`](k8s/keda.yaml) adds that via KEDA and its HTTP add-on;
remove the HPA first, since KEDA creates and owns its own and two controllers
fighting over one Deployment's replica count is a genuinely confusing outage.

The honest tradeoff: KEDA's scale-to-zero routes every request through an
interceptor, so you trade an extra network hop on every compile for not paying
for an idle pod. On Fly you get the same behaviour with no hop and no add-on.
That comparison is the reason both targets are here.

## Config

| Env | Default | What it does |
|---|---|---|
| `LATEX_SERVICE_SECRET` | — | Required. Bearer token every RPC must present. |
| `PORT` | `8080` | HTTP/1.1 listener: Connect, gRPC-Web, JSON, `/health`. |
| `GRPC_PORT` | `8081` | h2c listener: gRPC proper. |
| `LATEX_ENGINE` | `tectonic` | Swap for `pdflatex`/`xelatex` on a TeX Live base. |
| `COMPILE_TIMEOUT_MS` | `120000` | Per-document ceiling. |

## Local alternative

With `DAYSPRING_LATEX_SERVICE_URL` unset, Dayspring falls back to a locally
installed engine (`brew install tectonic`). That only ever fixes your own
machine, which is why the service is the default recommendation.
