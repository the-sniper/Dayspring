// Compile a .tex resume to PDF, and find out how many pages it actually is.
//
// The page count is the point. "Fill one page, don't spill to two" is the rule
// the old generator was worst at, because a model estimating its own page count
// from bullet counts is guessing. Compiling and reading the real number turns
// that guess into a fact we can hand back for one repair pass.
//
// Local-only by nature: it shells out to a TeX distribution. Hosted deployments
// get a clear error rather than a mystery failure.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isHosted } from "@/lib/hosted";

export type TexEngine = "tectonic" | "pdflatex" | "xelatex" | "lualatex";

// tectonic first: it fetches missing packages on demand, so an unusual resume
// class works without a full TeX Live install.
const ENGINES: TexEngine[] = ["tectonic", "pdflatex", "xelatex", "lualatex"];

// PATH alone is not enough. A Next process started from a login shell inherits
// the TeX bin dir, but one started by launchd (the daily agent), by a GUI
// launcher, or through some node version managers gets a minimal PATH — and
// then an installed MacTeX looks exactly like no MacTeX at all. So: try PATH
// first, then probe the handful of places TeX actually installs to.
const EXTRA_BIN_DIRS = [
  "/Library/TeX/texbin", // MacTeX / BasicTeX — the usual macOS answer
  "/usr/local/texlive/bin/universal-darwin",
  "/usr/local/texlive/bin/x86_64-darwin",
  "/opt/homebrew/bin", // Apple Silicon Homebrew
  "/usr/local/bin", // Intel Homebrew
  "/usr/bin",
  "/opt/local/bin", // MacPorts
];

export type TexEngineInfo = { name: TexEngine; bin: string };

// A negative result is cached only briefly: the whole point of the "install
// tectonic" hint is that you go and install it, and having to restart the dev
// server before the app notices makes the hint feel broken.
const NEGATIVE_TTL_MS = 30_000;
let cached: { info: TexEngineInfo | null; at: number } | null = null;

function onPath(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(process.platform === "win32" ? "where" : "which", [bin], {
      stdio: "ignore",
    });
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

function isExecutable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function detectEngine(): Promise<TexEngineInfo | null> {
  // An explicit override beats all detection — the escape hatch for a TeX
  // install somewhere none of this guesses.
  const override = process.env.DAYSPRING_TEX_ENGINE?.trim();
  if (override) {
    const name = (ENGINES.find((e) => override.endsWith(e)) ?? "pdflatex") as TexEngine;
    return { name, bin: override };
  }

  if (cached && (cached.info !== null || Date.now() - cached.at < NEGATIVE_TTL_MS)) {
    return cached.info;
  }

  for (const name of ENGINES) {
    if (await onPath(name)) {
      cached = { info: { name, bin: name }, at: Date.now() };
      return cached.info;
    }
    for (const dir of EXTRA_BIN_DIRS) {
      const bin = path.join(dir, name);
      if (isExecutable(bin)) {
        cached = { info: { name, bin }, at: Date.now() };
        return cached.info;
      }
    }
  }
  cached = { info: null, at: Date.now() };
  return null;
}

// Where detection looked, so "not found" is diagnosable instead of mysterious.
// Operator-facing only — see noEngineMessage().
export function searchedLocations(): string[] {
  return ["$PATH", ...EXTRA_BIN_DIRS];
}

// Two audiences, two messages.
//
// Locally, the person seeing this IS the operator: they can install a TeX
// distribution, and the search paths tell them whether the problem is "nothing
// installed" or "installed where this process can't see it".
//
// On a hosted deployment nobody can install anything — a serverless function
// has no TeX binary and never will. Telling a user to `brew install tectonic`
// or to set an env var in .env.local is advice they cannot act on, and dumping
// filesystem paths at them is worse than saying nothing. So they get the honest
// version: this step runs on the machine, here's what you still get.
export function noEngineMessage(hosted: boolean): string {
  if (hosted) {
    return "PDF rendering isn't configured on this deployment (no LaTeX compile service). The .tex is still generated and tailored to this job — download it and compile it in Overleaf to get the PDF.";
  }
  return `No LaTeX backend configured. The recommended setup is the compile sidecar in services/latex — deploy it once and set DAYSPRING_LATEX_SERVICE_URL, and nothing needs installing here or on any user's machine (see services/latex/README.md). Alternatively install a TeX distribution locally: searched $PATH and ${EXTRA_BIN_DIRS.join(", ")} for tectonic, pdflatex, xelatex and lualatex, and \`brew install tectonic\` is the smallest option. If you have one installed elsewhere, point DAYSPRING_TEX_ENGINE at the binary. Without a backend the .tex is still generated and downloadable, it just isn't rendered.`;
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const take = (b: Buffer) => {
      // A LaTeX log can run to megabytes on an error cascade; only the tail is
      // ever useful and the head is boilerplate.
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

// "Output written on resume.pdf (2 pages, 51234 bytes)." — every engine emits
// this line, and it beats re-parsing the PDF just to count pages.
export function pageCountFromLog(log: string): number | null {
  const m = log.match(/Output written on [^(]*\((\d+) pages?/);
  return m ? Number(m[1]) : null;
}

// The first real error, not the 200 lines of recovery noise after it.
//
// Two formats, because -file-line-error (which we pass, for the line numbers)
// REPLACES TeX's classic "! Undefined control sequence." with
// "./resume.tex:3: Undefined control sequence.". Matching only "^! " misses
// every error we actually produce. Verified against pdflatex output.
const TEX_ERROR_RX = /^(?:!\s|.*?\.tex:\d+:\s)/;

export function firstTexError(log: string): string | null {
  const lines = log.split("\n");
  const i = lines.findIndex((l) => TEX_ERROR_RX.test(l));
  if (i < 0) return null;
  return lines
    .slice(i, i + 6)
    .join("\n")
    .trim()
    .slice(0, 800);
}

// Count pages straight from the PDF, for engines whose log we couldn't parse.
function pageCountFromPdf(bytes: Buffer): number | null {
  const text = bytes.toString("latin1");
  const counts = [...text.matchAll(/\/Type\s*\/Page[^s]/g)].length;
  return counts > 0 ? counts : null;
}

// ── The sidecar ──────────────────────────────────────────────────────────────
// The default backend. Nothing on npm compiles LaTeX to PDF inside Node without
// a TeX install, and the WASM engines that could are browser-only — so the
// compile lives in a small container instead (services/latex). Configure it and
// nobody, you or any user, installs a TeX distribution.

export function serviceUrl(): string | null {
  const url = process.env.DAYSPRING_LATEX_SERVICE_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

async function compileViaService(
  url: string,
  latex: string,
  timeoutMs: number,
): Promise<CompileResult> {
  const { compileRemote } = await import("@/lib/resumes/latex-client");
  const res = await compileRemote(url, latex, timeoutMs);
  if (res.ok) {
    return {
      ok: true,
      pdf: res.pdf,
      pages: res.pages,
      engine: (res.engine as TexEngine) ?? "tectonic",
      log: "",
    };
  }
  // engine null when we never reached the service — the UI uses that to tell
  // "your LaTeX is broken" apart from "your service is down".
  return { ok: false, error: res.error, log: "", engine: res.reachable ? "tectonic" : null };
}

export type CompileResult =
  | { ok: true; pdf: Buffer; pages: number; engine: TexEngine; log: string }
  | { ok: false; error: string; log: string; engine: TexEngine | null };

export async function compileLatex(
  latex: string,
  opts: { timeoutMs?: number } = {},
): Promise<CompileResult> {
  // Service first when configured: it's what production uses, and having dev
  // silently render with a different engine than production means the page
  // count you tuned against isn't the one your users get.
  const url = serviceUrl();
  if (url) return compileViaService(url, latex, opts.timeoutMs ?? 180_000);

  const found = await detectEngine();
  if (!found) {
    return { ok: false, error: noEngineMessage(isHosted()), log: "", engine: null };
  }
  const engine = found.name;
  const bin = found.bin;

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dayspring-tex-"));
  const tex = path.join(dir, "resume.tex");
  const pdf = path.join(dir, "resume.pdf");
  try {
    await fs.promises.writeFile(tex, latex, "utf-8");
    const timeoutMs = opts.timeoutMs ?? 90_000;

    let log = "";
    if (engine === "tectonic") {
      const r = await run(bin, ["--keep-logs", "--print", "resume.tex"], dir, timeoutMs);
      log = r.out;
    } else {
      // Two passes: anything using \pageref or a ToC needs the second one to
      // settle. -interaction=nonstopmode so a bad macro fails fast instead of
      // hanging on a prompt no one is there to answer.
      for (let pass = 0; pass < 2; pass++) {
        const r = await run(
          bin,
          ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "resume.tex"],
          dir,
          timeoutMs,
        );
        log = r.out;
        if (r.code !== 0 && pass === 0) break; // don't run pass two over a broken build
      }
    }

    if (!fs.existsSync(pdf)) {
      return {
        ok: false,
        error: firstTexError(log) ?? "LaTeX produced no PDF.",
        log,
        engine,
      };
    }
    const bytes = await fs.promises.readFile(pdf);
    const pages = pageCountFromLog(log) ?? pageCountFromPdf(bytes);
    if (!pages) {
      return { ok: false, error: "Compiled, but the page count was unreadable.", log, engine };
    }
    return { ok: true, pdf: bytes, pages, engine, log };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// What to tell the model when the page count missed the target. Specific beats
// "make it longer" — it knows what it wrote, it just couldn't see the result.
export function lengthProblem(actual: number, target: number): string | null {
  if (actual === target) return null;
  if (actual > target) {
    return `The compiled PDF came out at ${actual} pages, but the target is ${target}. Cut the least JD-relevant bullets and tighten wordy phrasing until it fits exactly ${target}. Do not shrink the font below 10pt or the margins below 0.5in.`;
  }
  if (target === 2 && actual === 1) {
    return `The compiled PDF came out at 1 page, but the target is 2 full pages. Add real, JD-relevant material from the knowledge base — more bullets on the most relevant roles, and a Projects section if there isn't one — until page two is at least half full. Do not pad with filler, larger fonts, or wider spacing.`;
  }
  return `The compiled PDF came out at ${actual} pages, but the target is ${target}. Add real, JD-relevant material from the knowledge base until it fills ${target} pages cleanly.`;
}
