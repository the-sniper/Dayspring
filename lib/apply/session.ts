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
import type { BrowserContext, CDPSession, Page } from "playwright";
import {
  appendApplyLog,
  loadApplyContext,
  setApplyStatus,
  type ApplyContext,
} from "@/lib/apply/core";
import { closeApplyBrowser, openApplyBrowser } from "@/lib/apply/browser";
import type { SerializedField } from "@/lib/apply/ai-fill";
import { detectAts } from "@/lib/apply/ats-forms";
import { isHosted } from "@/lib/hosted";
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
  // headed = a real window opens on this machine; embedded = headless with a
  // live view streamed into the app (CDP screencast + input passthrough).
  mode: "headed" | "embedded";
  phase: ApplyPhase;
  outcome: ApplyOutcome | null;
  message: string; // current step / error / confirmation evidence, human-readable
  filled: string[];
  skipped: string[];
  resumeSource: "tailored" | "master" | "settings" | null;
  workday: { existingUsername: string | null; hasMaster: boolean } | null;
  // Tsenta-style review summary: every answered field on the form at review
  // time — what will actually be submitted.
  review: { label: string; value: string }[] | null;
  startedAt: string;
};

type ActiveSession = {
  state: ApplySessionState;
  // A persistent-profile context (or the user's own Chrome, when attached over
  // CDP). Persistent contexts have no parent Browser, so liveness is tracked
  // with an explicit flag instead of browser.isConnected().
  context: BrowserContext | null;
  attached: boolean;
  contextClosed: boolean;
  page: Page | null;
  cdp: CDPSession | null;
  // Latest screencast frame (embedded mode) — served by /api/apply/frame.
  lastFrame: { data: Buffer; ts: number; width: number; height: number } | null;
  // Set by skipFill(): the fill pass stops at the next field and the session
  // jumps to review — a stuck field must never wedge the run.
  fillAbort?: boolean;
  // Last snapshot taken by the MCP apply loop. Field refs are DOM attributes
  // written during serialization, so a fill can only address fields from the
  // most recent snapshot — hence keeping it here rather than re-deriving.
  lastSnapshot: SerializedField[] | null;
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
  return !!s.context && !s.contextClosed && !!s.page && !s.page.isClosed();
}

async function closeBrowser(s: ActiveSession): Promise<void> {
  await closeApplyBrowser({ context: s.context, page: s.page, attached: s.attached });
  s.context = null;
  s.contextClosed = true;
  s.page = null;
  s.cdp = null;
  s.lastFrame = null;
}

function finish(s: ActiveSession, outcome: ApplyOutcome, message: string): void {
  s.state.phase = "done";
  s.state.outcome = outcome;
  s.state.message = message;
}

// ── ToS acknowledgement (per host, persisted in the settings store) ─────────
export async function hasTosAck(host: string): Promise<boolean> {
  return (await getSetting(`tos:${host}`)) !== null;
}

export async function recordTosAck(host: string): Promise<void> {
  if ((await getSetting(`tos:${host}`)) === null) {
    await setSetting(`tos:${host}`, new Date().toISOString());
  }
}

// ── Start ────────────────────────────────────────────────────────────────────
export type StartResult =
  | { ok: true; state: ApplySessionState }
  | { ok: false; error: string; needsTosFor?: string; activeJobId?: string };

export async function startSession(
  jobId: string,
  opts: { masterResumeId?: string | null; embedded?: boolean } = {},
): Promise<StartResult> {
  if (isHosted()) {
    // Name the flag: a local server started from a shell that happens to export
    // one of these trips the gate, and the generic message reads like a bug in
    // the apply flow rather than an environment problem.
    const flag = process.env.VERCEL ? "VERCEL" : "DAYSPRING_HOSTED";
    return {
      ok: false,
      error:
        `Apply-assist opens a browser window on the machine running Dayspring, so it's only available when you run the app locally — open the job's application link and apply in your own browser instead. (This server has ${flag} set in its environment; unset it and restart if you are running locally.)`,
    };
  }
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

  const loaded = await loadApplyContext(jobId, { masterResumeId: opts.masterResumeId });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { ctx } = loaded;

  const host = new URL(ctx.job.url!).host;
  if (!(await hasTosAck(host))) {
    return {
      ok: false,
      error: `First run against ${host} — accept the automation risk to continue.`,
      needsTosFor: host,
    };
  }

  const ats = detectAts(ctx.job.url!);
  const session: ActiveSession = {
    ctx,
    context: null,
    attached: false,
    contextClosed: false,
    page: null,
    cdp: null,
    lastFrame: null,
    lastSnapshot: null,
    state: {
      jobId,
      jobTitle: ctx.job.title,
      companyName: ctx.job.companyName,
      host,
      ats,
      mode: opts.embedded ? "embedded" : "headed",
      phase: "launching",
      outcome: null,
      message: opts.embedded
        ? "Opening a browser session (streamed below)…"
        : "Opening a browser window on this machine…",
      filled: [],
      skipped: [],
      resumeSource: ctx.resumeSource,
      workday: null,
      review: null,
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
  const embedded = s.state.mode === "embedded";
  // The browser now arrives with a profile: a persistent Dayspring profile by
  // default, or the user's own Chrome when DAYSPRING_CDP_URL is set. Either way
  // it is already signed into whatever it has been signed into before, which is
  // what makes Workday autofillable at all.
  const opened = await openApplyBrowser({ embedded });
  s.context = opened.context;
  s.page = opened.page;
  s.attached = opened.attached;
  s.contextClosed = false;
  opened.context.on("close", () => {
    s.contextClosed = true;
  });
  await appendApplyLog(s.state.jobId, `browser: ${opened.describe}`);
  if (embedded) await startScreencast(s);
  await s.page.goto(s.ctx.job.url!, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // Workday is account-based, so historically it was always manual. With a
  // persistent profile we may already be signed into this tenant — in which
  // case the application form is right there and takes the normal fill path.
  let workdayManual = false;
  if (s.state.ats === "workday") {
    const { workdaySignedIn } = await import("@/lib/apply/ats-forms");
    workdayManual = !(await workdaySignedIn(s.page));
    if (workdayManual) {
      // Not signed in — surface the vaulted credential + OTP helpers and let
      // the human drive. Signing in once here makes every future application
      // to this tenant take the autofill path above.
      const { credentialForHost, hasMasterPassword } = await import("@/lib/vault/core");
      const { hasVaultKey } = await import("@/lib/vault/crypto");
      const cred = hasVaultKey() ? await credentialForHost(s.state.host) : null;
      s.state.workday = {
        existingUsername: cred?.username ?? null,
        hasMaster: hasVaultKey() && await hasMasterPassword(),
      };
      s.state.message =
        "Workday is account-based and this profile isn't signed into this tenant yet — sign in or register in the browser window (credential helpers below), complete the form, then approve here. Once you've signed in, future applications to this tenant autofill.";
      await appendApplyLog(s.state.jobId, "workday session — signed out, manual fill with helpers");
    } else {
      await appendApplyLog(s.state.jobId, "workday session — profile already signed in, autofilling");
    }
  }

  // Signed-out Workday was fully handled above; everything else autofills.
  if (!workdayManual) {
    s.state.phase = "filling";
    s.state.message = "Waiting for the application form to load…";
    const { waitForFormReady } = await import("@/lib/apply/ats-forms");
    await waitForFormReady(s.page);
    s.state.message = "Autofilling from your profile + tailored materials…";
    // Hard bounds: the selector pass gets 60s total, the AI mapping call 45s.
    // Whatever isn't filled by then is the human's at review — never wedge.
    const fillDeadline = Date.now() + 60_000;
    const aborted = () => !!s.fillAbort || Date.now() > fillDeadline;
    const { fillCommonForm } = await import("@/lib/apply/ats-forms");
    const res = await fillCommonForm(s.page, s.ctx, {
      isAborted: aborted,
      onProgress: (label) => {
        s.state.message = `Filling: ${label}…`;
      },
    });
    s.state.filled = res.filled;
    s.state.skipped = res.skipped;
    // AI fallback: one cheap structured call maps profile facts onto fields
    // the selectors missed (EEO filtered out before the model sees anything).
    if (!aborted()) {
      try {
        s.state.message = "Answering screening questions (memory + AI)…";
        const { aiFillRemaining } = await import("@/lib/apply/ai-fill");
        const ai = await aiFillRemaining(s.page, s.ctx, {
          timeoutMs: 45_000,
          isAborted: () => !!s.fillAbort,
        });
        if (ai.fromMemory.length > 0) {
          s.state.filled.push(...ai.fromMemory.map((l) => `${l} (saved answer)`));
          await appendApplyLog(s.state.jobId, `answered from memory: ${ai.fromMemory.join(", ")}`);
        }
        if (ai.filled.length > 0) {
          s.state.filled.push(...ai.filled.map((l) => `${l} (AI)`));
          await appendApplyLog(s.state.jobId, `ai-filled: ${ai.filled.join(", ")}`);
        }
      } catch {
        // best-effort — the review gate catches anything missed
      }
    }
    if (s.fillAbort) {
      await appendApplyLog(s.state.jobId, "autofill skipped to review by user");
    } else if (Date.now() > fillDeadline) {
      await appendApplyLog(s.state.jobId, "autofill hit its time budget — went to review");
    }
    s.state.message = embedded
      ? "Review the live view below — click any field to fix it, solve any CAPTCHA, answer EEO questions yourself — then approve."
      : "Review the browser window: solve any CAPTCHA, answer EEO questions yourself, fix anything missed — then approve here.";
    const missing = [
      !s.ctx.fields.fullName && "name",
      !s.ctx.fields.email && "email",
      !s.ctx.fields.phone && "phone",
    ].filter(Boolean);
    if (missing.length > 0) {
      s.state.message += ` Heads-up: no ${missing.join(", ")} found in your profile — add them on the Profile page for fuller autofill.`;
    }
    // Tsenta-style review summary — what's actually on the form right now.
    const { captureFormAnswers } = await import("@/lib/apply/ats-forms");
    s.state.review = await captureFormAnswers(s.page);
    await appendApplyLog(s.state.jobId, `review capture: ${s.state.review.length} answered fields`);
    await appendApplyLog(
      s.state.jobId,
      `autofilled: ${res.filled.join(", ") || "(nothing)"} [resume: ${s.state.resumeSource ?? "none"}]`,
    );
  }
  s.state.phase = "awaiting_review";
}

// ── Embedded live view (Tsenta-style) ───────────────────────────────────────
// CDP screencast streams JPEG frames of the headless page; the client renders
// the latest frame (~2 fps via /api/apply/frame) and forwards clicks/keys
// (/api/apply/input) so the human can still fix fields and solve CAPTCHAs.
async function startScreencast(s: ActiveSession): Promise<void> {
  const cdp = await s.page!.context().newCDPSession(s.page!);
  s.cdp = cdp;
  cdp.on("Page.screencastFrame", (frame) => {
    s.lastFrame = {
      data: Buffer.from(frame.data, "base64"),
      ts: Date.now(),
      width: frame.metadata.deviceWidth,
      height: frame.metadata.deviceHeight,
    };
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 60,
    maxWidth: 1280,
    maxHeight: 1400,
    everyNthFrame: 2,
  });
}

export function getSessionFrame(): { data: Buffer; ts: number; width: number; height: number } | null {
  const s = active();
  if (!s || s.state.mode !== "embedded" || s.state.phase === "done") return null;
  return s.lastFrame;
}

export type SessionInput =
  | { kind: "click"; x: number; y: number }
  | { kind: "wheel"; x: number; y: number; deltaY: number }
  | { kind: "text"; text: string }
  | { kind: "key"; key: string };

// Whitelisted non-printable keys the live view forwards.
const FORWARDABLE_KEYS = new Set([
  "Enter", "Backspace", "Tab", "Delete", "Escape",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

export async function dispatchSessionInput(ev: SessionInput): Promise<{ ok: boolean; error?: string }> {
  const s = active();
  if (!s || s.state.mode !== "embedded" || s.state.phase === "done" || !browserAlive(s)) {
    return { ok: false, error: "No embedded session." };
  }
  try {
    const page = s.page!;
    if (ev.kind === "click") {
      await page.mouse.click(ev.x, ev.y);
    } else if (ev.kind === "wheel") {
      await page.mouse.move(ev.x, ev.y);
      await page.mouse.wheel(0, ev.deltaY);
    } else if (ev.kind === "text") {
      await page.keyboard.type(ev.text.slice(0, 200));
    } else if (ev.kind === "key") {
      if (!FORWARDABLE_KEYS.has(ev.key)) return { ok: false, error: "Key not forwardable." };
      await page.keyboard.press(ev.key);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "input failed" };
  }
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
  const { formScope } = await import("@/lib/apply/ats-forms");
  const scope = await formScope(page); // the form may live inside an iframe
  for (const sel of SUBMIT_SELECTORS) {
    try {
      const el = scope.locator(sel).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        await el.click({ timeout: 5000 });
        return { ok: true, how: sel };
      }
    } catch {
      // next candidate
    }
  }
  try {
    const byRole = scope
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
      // Confirmation may render in the main document OR inside the ATS iframe.
      for (const frame of page.frames()) {
        const body = await frame.locator("body").innerText({ timeout: 2000 }).catch(() => "");
        const m = body.match(rx);
        if (m) return `page shows “${m[0]}”`;
      }
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

// Whatever is on the form when the human approves IS their answer — bank the
// screening questions for future applications (contact + EEO never banked).
async function bankAnswersOnApproval(s: ActiveSession): Promise<void> {
  try {
    const { captureFormAnswers } = await import("@/lib/apply/ats-forms");
    const { saveAnswers } = await import("@/lib/apply/answers");
    const pairs = await captureFormAnswers(s.page!);
    const saved = await saveAnswers(pairs);
    if (saved > 0) {
      await appendApplyLog(s.state.jobId, `banked ${saved} screening answers for reuse`);
    }
  } catch {
    // memory is a convenience — never block a submission on it
  }
}

// Approve → THE TOOL clicks Submit (the one place submission happens).
export async function approveAndSubmit(): Promise<DecisionResult> {
  const s = requirePhase("awaiting_review");
  if ("error" in s) return { ok: false, error: s.error };

  await bankAnswersOnApproval(s);
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
  await bankAnswersOnApproval(s); // page may already be past the form — best-effort
  await markApplied(s, "human submitted in the window → applied");
  await closeBrowser(s);
  finish(s, "manual", "Recorded as applied ✓ (you submitted).");
  return { ok: true, state: s.state };
}

// Escape hatch while filling: stop the autofill pass at the next field and
// go straight to review. The human finishes the form in the live view.
export async function skipFill(): Promise<DecisionResult> {
  const s = active();
  if (!s || s.state.phase !== "filling") {
    return { ok: false, error: "No fill pass is running." };
  }
  s.fillAbort = true;
  s.state.message = "Skipping ahead — finish the form yourself, then approve.";
  return { ok: true, state: s.state };
}

// ── The MCP apply loop ───────────────────────────────────────────────────────
// aiFillRemaining is one structured call: serialize the empty fields, get one
// mapping back, write each. When a write fails — no matching combobox option,
// a select value that isn't verbatim in the option list — nothing retries and
// nothing reports it, so the field is silently still empty at the review gate.
//
// These three functions turn that into a loop an MCP client can drive: look at
// the form, fill ONE field, look again to see whether it took, try something
// else if it didn't, and walk multi-page wizards. Deliberately stops short of
// submitting — approveAndSubmit stays a UI action, so the click that sends an
// application is always a human's.

export type SnapshotResult =
  | {
      ok: true;
      phase: ApplyPhase;
      url: string;
      // Visible fields that are still empty, with a ref usable by fillField.
      empty: SerializedField[];
      // Everything currently answered — what would be submitted right now.
      answered: { label: string; value: string }[];
    }
  | { ok: false; error: string };

function liveSession(): ActiveSession | { error: string } {
  const s = active();
  if (!s || s.state.phase === "done") return { error: "No apply session is running." };
  if (!browserAlive(s)) return { error: "The browser window was closed." };
  return s;
}

export async function snapshotSession(): Promise<SnapshotResult> {
  const s = liveSession();
  if ("error" in s) return { ok: false, error: s.error };
  const { serializeEmptyFields } = await import("@/lib/apply/ai-fill");
  const { captureFormAnswers, formScope } = await import("@/lib/apply/ats-forms");
  const scope = await formScope(s.page!);
  const empty = await serializeEmptyFields(scope);
  s.lastSnapshot = empty;
  return {
    ok: true,
    phase: s.state.phase,
    url: s.page!.url(),
    empty,
    answered: await captureFormAnswers(s.page!),
  };
}

export type FillFieldResult =
  | { ok: true; wrote: boolean; label: string }
  | { ok: false; error: string };

export async function fillSessionField(
  ref: string,
  value: string,
): Promise<FillFieldResult> {
  const s = liveSession();
  if ("error" in s) return { ok: false, error: s.error };
  const field = s.lastSnapshot?.find((f) => f.ref === ref);
  if (!field) {
    return {
      ok: false,
      error: "Unknown field ref — take a snapshot first; refs are only valid for the latest one.",
    };
  }
  // EEO stays a human decision on every path into this module, including this
  // one. serializeEmptyFields already filters it, so this is belt-and-braces
  // against a stale snapshot or a hand-written ref.
  if (/gender|race|ethnic|veteran|disab|sexual orientation|pronoun|self[- ]?identif|demographic/i.test(field.label)) {
    return { ok: false, error: "Demographic and EEO questions are never auto-answered." };
  }
  const { writeField } = await import("@/lib/apply/ai-fill");
  const { formScope } = await import("@/lib/apply/ats-forms");
  const scope = await formScope(s.page!);
  const wrote = await writeField(scope, field, value);
  if (wrote) {
    field.value = value;
    s.state.filled.push(`${field.label.slice(0, 40)} (agent)`);
    await appendApplyLog(s.state.jobId, `agent filled: ${field.label.slice(0, 60)}`);
  }
  return { ok: true, wrote, label: field.label };
}

const ADVANCE_RX = /^(next|continue|save and continue|save & continue|proceed)$/i;

export type AdvanceResult =
  | { ok: true; advanced: boolean; url: string; how: string }
  | { ok: false; error: string };

// Move to the next page of a multi-page application. Deliberately does NOT
// match "submit"/"apply" — advancing must never be able to send.
export async function advanceSession(): Promise<AdvanceResult> {
  const s = liveSession();
  if ("error" in s) return { ok: false, error: s.error };
  const { formScope, waitForFormReady } = await import("@/lib/apply/ats-forms");
  const scope = await formScope(s.page!);
  const before = s.page!.url();
  try {
    const btn = scope.getByRole("button", { name: ADVANCE_RX }).first();
    if ((await btn.count()) === 0 || !(await btn.isVisible())) {
      return { ok: true, advanced: false, url: before, how: "no next/continue button found" };
    }
    await btn.click({ timeout: 5000 });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "advance failed" };
  }
  await waitForFormReady(s.page!);
  s.lastSnapshot = null; // refs from the previous page are meaningless now
  const after = s.page!.url();
  await appendApplyLog(s.state.jobId, `agent advanced to next page (${after})`);
  return { ok: true, advanced: true, url: after, how: "clicked next/continue" };
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
  if (!await hasGmail()) return { ok: false, error: "Gmail isn't connected." };
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
