// Dayspring LaTeX compile sidecar.
//
// Exists so nobody installs a TeX distribution — not you, not any user of a
// hosted deployment. Nothing on npm compiles LaTeX to PDF inside Node without a
// local TeX install, and the WASM engines that could are browser-only, so the
// compile lives in a container instead.
//
// TWO LISTENERS, on purpose. Node's plaintext http2 server cannot reliably also
// serve HTTP/1.1 (allowHTTP1 works for TLS+ALPN, not for h2c with prior
// knowledge), so one port genuinely cannot serve both gRPC and plain JSON.
// Verified, not assumed. So:
//
//   PORT      (HTTP/1.1) — Connect protocol, gRPC-Web, plain HTTP/JSON, /health
//   GRPC_PORT (h2c)      — gRPC proper
//
// Both are the same Connect handler over the same generated service, so there
// is one implementation and three wire protocols. The HTTP/1.1 port is what
// Dayspring uses by default: it works from Vercel, from curl, and through any
// proxy, none of which is guaranteed for h2c.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer as createH1 } from "node:http";
import { createServer as createH2c } from "node:http2";
import os from "node:os";
import path from "node:path";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { Code, ConnectError } from "@connectrpc/connect";
// Same relative path in a checkout (services/latex → shared/gen) and in the
// container (/app → /shared/gen), so there is no build-only rewriting.
import { LatexService } from "../../shared/gen/dayspring/latex/v1/latex_pb.js";

const PORT = Number(process.env.PORT || 8080);
const GRPC_PORT = Number(process.env.GRPC_PORT || 8081);
const SECRET = process.env.LATEX_SERVICE_SECRET;
const ENGINE = process.env.LATEX_ENGINE || "tectonic";
const COMPILE_TIMEOUT_MS = Number(process.env.COMPILE_TIMEOUT_MS || 120_000);

if (!SECRET) {
  console.error(
    "LATEX_SERVICE_SECRET is not set. Refusing to start an unauthenticated compile endpoint.",
  );
  process.exit(1);
}

function run(cmd, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    // Error cascades produce megabytes of log; only the tail is ever useful.
    const take = (b) => {
      out = (out + b.toString()).slice(-200_000);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, out: `${out}\n${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out });
    });
  });
}

function pageCountFromLog(log) {
  const m = log.match(/Output written on [^(]*\((\d+) pages?/);
  return m ? Number(m[1]) : null;
}

// tectonic's log format for the page count is undocumented, so counting
// /Type /Page objects out of the PDF is the reliable path there.
function pageCountFromPdf(bytes) {
  const n = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  return n > 0 ? n : null;
}

// -file-line-error replaces TeX's classic "! " prefix with "file.tex:12:", so
// matching only "^! " would miss every error this actually produces.
function firstTexError(log) {
  const lines = log.split("\n");
  const i = lines.findIndex((l) => /^(?:!\s|.*?\.tex:\d+:\s)/.test(l));
  return i < 0 ? null : lines.slice(i, i + 6).join("\n").trim().slice(0, 800);
}

async function compile(latex) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dstex-"));
  const pdfPath = path.join(dir, "resume.pdf");
  try {
    await fs.promises.writeFile(path.join(dir, "resume.tex"), latex, "utf-8");
    let log;
    if (ENGINE === "tectonic") {
      ({ out: log } = await run(
        ENGINE,
        ["-X", "compile", "--keep-logs", "--print", "resume.tex"],
        dir,
        COMPILE_TIMEOUT_MS,
      ));
    } else {
      // Two passes: \pageref and friends need the second one to settle.
      log = "";
      for (let pass = 0; pass < 2; pass++) {
        const r = await run(
          ENGINE,
          ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "resume.tex"],
          dir,
          COMPILE_TIMEOUT_MS,
        );
        log = r.out;
        if (r.code !== 0 && pass === 0) break;
      }
    }
    if (!fs.existsSync(pdfPath)) {
      // InvalidArgument, not Internal: a document that doesn't compile is the
      // caller's problem to fix, and the error text is what the repair pass
      // feeds back to the model.
      throw new ConnectError(
        firstTexError(log) || "LaTeX produced no PDF.",
        Code.InvalidArgument,
      );
    }
    const pdf = await fs.promises.readFile(pdfPath);
    const pages = pageCountFromLog(log) || pageCountFromPdf(pdf);
    if (!pages) {
      throw new ConnectError("Compiled, but the page count was unreadable.", Code.Internal);
    }
    return { pdf: new Uint8Array(pdf), pages, engine: ENGINE };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// An open compile endpoint on a public URL is a free CPU faucet, so every RPC
// checks the bearer token. Connect exposes headers through the handler context.
function requireAuth(ctx) {
  if (ctx.requestHeader.get("authorization") !== `Bearer ${SECRET}`) {
    throw new ConnectError("unauthorized", Code.Unauthenticated);
  }
}

const routes = (router) =>
  router.service(LatexService, {
    async compile(req, ctx) {
      requireAuth(ctx);
      if (!req.latex?.trim()) {
        throw new ConnectError("latex is required", Code.InvalidArgument);
      }
      return compile(req.latex);
    },
    async health(_req, ctx) {
      requireAuth(ctx);
      const v = await run(ENGINE, ["--version"], os.tmpdir(), 10_000);
      if (v.code !== 0) throw new ConnectError("engine unavailable", Code.Unavailable);
      return { engine: ENGINE, version: v.out.trim().split("\n")[0] || "" };
    },
  });

const connect = connectNodeAdapter({ routes });

// Unauthenticated GET /health for load-balancer probes. Fly's http checks and
// a k8s liveness probe both want a plain GET, and neither can present a bearer
// token or speak Connect — so this stays a separate, deliberately trivial
// endpoint that reports liveness only, never engine detail.
function h1Handler(req, res) {
  if (req.method === "GET" && (req.url === "/health" || req.url === "/healthz")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, engine: ENGINE }));
    return;
  }
  connect(req, res);
}

// 0.0.0.0, not "::". A container with IPv6 disabled rejects "::" outright with
// EAFNOSUPPORT, and the only symptom a platform shows for that is "timeout
// reached waiting for health checks" — a long hunt for a one-line cause.
// 0.0.0.0 binds everywhere that matters and is what Fly's proxy expects.
// Override with HOST=:: if you specifically need IPv6-only.
const HOST = process.env.HOST || "0.0.0.0";

function listen(server, port, label) {
  // Without this, a bind failure emits an unhandled 'error' event, which kills
  // the process with a bare stack trace. On a platform that reports crashes as
  // "health checks failed", that turns a one-line cause into a hunt.
  server.on("error", (err) => {
    console.error(`latex sidecar: ${label} failed to bind :${port} — ${err.message}`);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    console.log(`latex sidecar: ${label} listening on ${HOST}:${port}`);
  });
}

listen(createH1(h1Handler), PORT, "http/1.1 (connect, grpc-web, json, /health)");
listen(createH2c(connect), GRPC_PORT, "h2c (grpc)");

// A rejected promise that escapes a handler would otherwise take the whole
// process down on Node 20+, restarting the machine mid-compile.
process.on("unhandledRejection", (err) => {
  console.error("latex sidecar: unhandled rejection —", err);
});
