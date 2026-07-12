// In-app apply sessions — the browser-button replacement for the CLI.
// A single in-process manager owns one headed Chromium at a time; the UI
// polls state and supplies the human decisions (review → approve/submit,
// manual-submit, verdict, cancel). Same hard lines as always: EEO is never
// auto-answered, CAPTCHAs are the human's, and NOTHING submits without an
// explicit per-application approval click.
//
// The registry lives on globalThis so dev HMR doesn't orphan a live session.
// This is a one-machine, one-human-at-a-time design — the browser opens on
// the machine running Dayspring.
import type { Browser, Page } from "playwright";
import {
  appendApplyLog,
  loadApplyContext,
  setApplyStatus,
  type ApplyContext,
} from "@/lib/apply/core";
import { detectAts } from "@/lib/apply/ats-forms";
import { setJobStatusCore } from "@/lib/jobs/transition";
import { getSetting, setSetting } from "@/lib/settings/store";

export type ApplyPhase =
  | "launching"
  | "filling"
  | "awaiting_review" // human reviews the browser window; UI offers approve/manual/cancel
  | "submitting"
  | "awaiting_verdict" // tool clicked submit but couldn't confirm — human decides
  | "done";

export type ApplyOutcome = "submitted" | "manual" | "abandoned" | "error";

export type ApplySessionState = {
  jobId: string;
  jobTitle: string;
  companyName: string;
  host: string;
  ats: string;
  phase: ApplyPhase;
  outcome: ApplyOutcome | null;
  message: string; // current step / error / confirmation evidence, human-readable
  filled: string[];
  skipped: string[];
  resumeSource: "tailored" | "master" | "settings" | null;
  workday: { existingUsername: string | null; hasMaster: boolean } | null;
  startedAt: string;
};

type ActiveSession = {
  state: ApplySessionState;
  browser: Browser | null;
  page: Page | null;
  ctx: ApplyContext;
};

// Survives HMR reloads in dev; process-lifetime in production.
const g = globalThis as typeof globalThis & {
  __dsApplySession?: ActiveSession | null;
};

function active(): ActiveSession | null {
  return g.__dsApplySession ?? null;
}

function browserAlive(s: ActiveSession): boolean {
  return !!s.browser?.isConnected() && !!s.page && !s.page.isClosed();
}

async function closeBrowser(s: ActiveSession): Promise<void> {
  try {
    await s.browser?.close();
  } catch {
    // already gone — the human may have closed the window
  }
  s.browser = null;
  s.page = null;
}

function finish(s: ActiveSession, outcome: ApplyOutcome, message: string): void {
  s.state.phase = "done";
  s.state.outcome = outcome;
  s.state.message = message;
}

// ── ToS acknowledgement (per host, persisted in the local settings store) ────
export function hasTosAck(host: string): boolean {
  return getSetting(`tos:${host}`) !== null;
}

export function recordTosAck(host: string): void {
  if (getSetting(`tos:${host}`) === null) {
    setSetting(`tos:${host}`, new Date().toISOString());
  }
}

// ── Start ────────────────────────────────────────────────────────────────────
export type StartResult =
  | { ok: true; state: ApplySessionState }
  | { ok: false; error: string; needsTosFor?: string; activeJobId?: string };

export async function startSession(jobId: string): Promise<StartResult> {
  const existing = active();
  if (existing && existing.state.phase !== "done") {
    if (browserAlive(existing)) {
      return {
        ok: false,
        error:
          existing.state.jobId === jobId
            ? "An apply session for this job is already running."
            : `Finish or cancel the apply session for “${existing.state.jobTitle}” first.`,
        activeJobId: existing.state.jobId,
      };
    }
    // Browser died out from under a previous session — clear it.
    finish(existing, "abandoned", "browser window was closed");
    await setApplyStatus(existing.state.jobId, "abandoned", "browser closed mid-session");
  }

  const loaded = await loadApplyContext(jobId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { ctx } = loaded;

  const host = new URL(ctx.job.url!).host;
  if (!hasTosAck(host)) {
    return {
      ok: false,
      error: `First run against ${host} — accept the automation risk to continue.`,
      needsTosFor: host,
    };
  }

  const ats = detectAts(ctx.job.url!);
  const session: ActiveSession = {
    ctx,
    browser: null,
    page: null,
    state: {
      jobId,
      jobTitle: ctx.job.title,
      companyName: ctx.job.companyName,
      host,
      ats,
      phase: "launching",
      outcome: null,
      message: "Opening a browser window on this machine…",
      filled: [],
      skipped: [],
      resumeSource: ctx.resumeSource,
      workday: null,
      startedAt: new Date().toISOString(),
    },
  };
  g.__dsApplySession = session;
  await setApplyStatus(jobId, "in_progress", `apply session opened (${ats}, in-app)`);

  // Fire-and-forget: the flow advances state; the UI polls it. Local Node
  // process — the promise keeps running after the action responds.
  void runToReview(session).catch(async (err) => {
    await appendApplyLog(jobId, `error: ${err instanceof Error ? err.message : String(err)}`);
    await closeBrowser(session);
    finish(session, "error", err instanceof Error ? err.message : "Apply session failed");
    await setApplyStatus(jobId, "abandoned", "session error");
  });

  return { ok: true, state: session.state };
}

async function runToReview(s: ActiveSession): Promise<void> {
  const { chromium } = await import("playwright");
  s.browser = await chromium.launch({ headless: false });
  s.page = await s.browser.newPage();
  await s.page.goto(s.ctx.job.url!, { waitUntil: "domcontentloaded", timeout: 60_000 });

  if (s.state.ats === "workday") {
    // Workday forms are per-tenant and account-based — the human drives them;
    // we surface the vaulted credential + OTP helpers in the panel instead.
    const { credentialForHost, hasMasterPassword } = await import("@/lib/vault/core");
    const { hasVaultKey } = await import("@/lib/vault/crypto");
    const cred = hasVaultKey() ? await credentialForHost(s.state.host) : null;
    s.state.workday = {
      existingUsername: cred?.username ?? null,
      hasMaster: hasVaultKey() && hasMasterPassword(),
    };
    s.state.message =
      "Workday is account-based — sign in or register in the browser window (credential helpers below), complete the form, then approve here.";
    await appendApplyLog(s.state.jobId, "workday session — manual fill with helpers");
  } else {
    s.state.phase = "filling";
    s.state.message = "Autofilling from your profile + tailored materials…";
    const { fillCommonForm } = await import("@/lib/apply/ats-forms");
    const res = await fillCommonForm(s.page, s.ctx);
    s.state.filled = res.filled;
    s.state.skipped = res.skipped;
    s.state.message =
      "Review the browser window: solve any CAPTCHA, answer EEO questions yourself, fix anything missed — then approve here.";
    await appendApplyLog(
      s.state.jobId,
      `autofilled: ${res.filled.join(", ") || "(nothing)"} [resume: ${s.state.resumeSource ?? "none"}]`,
    );
  }
  s.state.phase = "awaiting_review";
}

// ── Poll ─────────────────────────────────────────────────────────────────────
export function getSessionState(jobId?: string): ApplySessionState | null {
  const s = active();
  if (!s) return null;
  if (jobId !== undefined && s.state.jobId !== jobId) return null;
  // If the human closed the window mid-review, surface that instead of hanging.
  if (
    (s.state.phase === "awaiting_review" || s.state.phase === "awaiting_verdict") &&
    !browserAlive(s)
  ) {
    finish(s, "abandoned", "The browser window was closed — nothing was submitted.");
    void setApplyStatus(s.state.jobId, "abandoned", "browser closed at review");
  }
  return s.state;
}

// ── Human decisions ──────────────────────────────────────────────────────────
const SUBMIT_SELECTORS = [
  "#submit_app", // greenhouse
  'button[type="submit"]:visible',
  'input[type="submit"]:visible',
  ".template-btn-submit", // lever
];

async function clickSubmit(page: Page): Promise<{ ok: boolean; how: string }> {
  for (const sel of SUBMIT_SELECTORS) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        await el.click({ timeout: 5000 });
        return { ok: true, how: sel };
      }
    } catch {
      // next candidate
    }
  }
  try {
    const byRole = page
      .getByRole("button", { name: /submit application|submit|apply now|apply/i })
      .first();
    if ((await byRole.count()) > 0 && (await byRole.isVisible())) {
      await byRole.click({ timeout: 5000 });
      return { ok: true, how: "submit/apply button" };
    }
  } catch {
    // fall through
  }
  return { ok: false, how: "no submit button found" };
}

async function detectConfirmation(page: Page): Promise<string | null> {
  const rx =
    /thank you|application (?:was )?submitted|we(?:'|’)ve received your application|received your application|application received|successfully submitted/i;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if (/confirmation|thank[-_]?you|success/i.test(page.url())) return `URL: ${page.url()}`;
      const body = await page.locator("body").innerText({ timeout: 3000 });
      const m = body.match(rx);
      if (m) return `page shows “${m[0]}”`;
    } catch {
      // mid-navigation — retry until deadline
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

async function markApplied(s: ActiveSession, how: string): Promise<void> {
  await setJobStatusCore(s.state.jobId, "applied"); // auto-creates the application row
  await setApplyStatus(s.state.jobId, "submitted", how);
}

export type DecisionResult = { ok: true; state: ApplySessionState } | { ok: false; error: string };

function requirePhase(phase: ApplyPhase): ActiveSession | { error: string } {
  const s = active();
  if (!s || s.state.phase === "done") return { error: "No apply session is running." };
  if (s.state.phase !== phase) return { error: `Session is ${s.state.phase}, not ${phase}.` };
  if (!browserAlive(s)) {
    finish(s, "abandoned", "The browser window was closed — nothing was submitted.");
    void setApplyStatus(s.state.jobId, "abandoned", "browser closed");
    return { error: "The browser window was closed." };
  }
  return s;
}

// Approve → THE TOOL clicks Submit (the one place submission happens).
export async function approveAndSubmit(): Promise<DecisionResult> {
  const s = requirePhase("awaiting_review");
  if ("error" in s) return { ok: false, error: s.error };

  s.state.phase = "submitting";
  s.state.message = "Clicking Submit and watching for confirmation…";
  const clicked = await clickSubmit(s.page!);
  if (!clicked.ok) {
    s.state.phase = "awaiting_review";
    s.state.message =
      "Couldn't find a Submit button — click it yourself in the browser, then use “I clicked Submit”.";
    return { ok: true, state: s.state };
  }
  await appendApplyLog(s.state.jobId, `tool clicked submit (${clicked.how}) after in-app approval`);

  const confirmed = await detectConfirmation(s.page!);
  if (confirmed) {
    await markApplied(s, `approved in-app → tool submitted (${confirmed})`);
    await closeBrowser(s);
    finish(s, "submitted", `Submitted ✓ — ${confirmed}. Recorded as applied.`);
  } else {
    s.state.phase = "awaiting_verdict";
    s.state.message =
      "Submit was clicked but no confirmation appeared within 15s — does the page show it went through?";
  }
  return { ok: true, state: s.state };
}

// Ambiguous confirmation — the human's read of the page decides the record.
export async function resolveVerdict(submitted: boolean): Promise<DecisionResult> {
  const s = active();
  if (!s || s.state.phase !== "awaiting_verdict") {
    return { ok: false, error: "Nothing awaiting a verdict." };
  }
  if (submitted) {
    await markApplied(s, "approved in-app → tool submitted (human confirmed on page)");
    await closeBrowser(s);
    finish(s, "submitted", "Submitted ✓ (you confirmed). Recorded as applied.");
  } else {
    await setApplyStatus(s.state.jobId, "abandoned", "submit clicked but unconfirmed — verify on site");
    await closeBrowser(s);
    finish(s, "abandoned", "Recorded as NOT submitted — verify on the site before retrying.");
  }
  return { ok: true, state: s.state };
}

// The human clicked the site's Submit themselves during review.
export async function recordManualSubmit(): Promise<DecisionResult> {
  const s = active();
  if (!s || (s.state.phase !== "awaiting_review" && s.state.phase !== "awaiting_verdict")) {
    return { ok: false, error: "No session awaiting review." };
  }
  await markApplied(s, "human submitted in the window → applied");
  await closeBrowser(s);
  finish(s, "manual", "Recorded as applied ✓ (you submitted).");
  return { ok: true, state: s.state };
}

export async function cancelSession(): Promise<DecisionResult> {
  const s = active();
  if (!s || s.state.phase === "done") return { ok: false, error: "No apply session is running." };
  await closeBrowser(s);
  await setApplyStatus(s.state.jobId, "abandoned", "cancelled in-app");
  finish(s, "abandoned", "Cancelled — nothing was submitted; pipeline status unchanged.");
  return { ok: true, state: s.state };
}

// Workday helper: read a fresh verification code from Gmail (never stored).
export async function readOtp(): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const { hasGmail } = await import("@/lib/integrations/gmail/client");
  if (!hasGmail()) return { ok: false, error: "Gmail isn't connected." };
  const { waitForWorkdayCode } = await import("@/lib/apply/workday-signup");
  const code = await waitForWorkdayCode({ sinceMs: Date.now() - 10 * 60_000 });
  if (!code) return { ok: false, error: "No code found in the last 10 minutes — trigger the email first." };
  return { ok: true, code };
}

// Workday helper: vault the account just created in the window (master pwd).
export async function vaultWorkdayAccount(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = active();
  if (!s) return { ok: false, error: "No apply session." };
  const { addCredential } = await import("@/lib/vault/core");
  const username = s.ctx.fields.email;
  if (!username) return { ok: false, error: "No email in your profile to register with." };
  const res = await addCredential({
    site: `Workday — ${s.state.host.split(".")[0]}`,
    host: s.state.host,
    username,
  });
  if (!res.ok) return { ok: false, error: res.error };
  await appendApplyLog(s.state.jobId, `workday credential vaulted for ${s.state.host}`);
  s.state.workday = { existingUsername: username, hasMaster: true };
  return { ok: true };
}
