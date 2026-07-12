// Attended apply-assist. Opens a HEADED browser you watch, autofills each form
// from your profile + tailored materials + per-job resume PDF, then stops at a
// hard review gate. When YOU type 'go', the tool clicks Submit for you
// (Tsenta-style approve→submit). Nothing is ever submitted without your
// explicit per-application approval; CAPTCHAs and EEO answers stay yours.
//
// Usage: npm run apply -- <jobId> [jobId2 jobId3 …]
export {}; // module scope

import { createInterface } from "node:readline";
import type { Page } from "playwright";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    }),
  );
}

// ── Submit-click helpers (M22) ───────────────────────────────────────────────

// ATS-specific candidates first, generic role-based last. The click only ever
// happens after the human types 'go' at the review gate.
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
      // try the next candidate
    }
  }
  try {
    const byRole = page
      .getByRole("button", { name: /submit application|submit|apply now|apply/i })
      .first();
    if ((await byRole.count()) > 0 && (await byRole.isVisible())) {
      await byRole.click({ timeout: 5000 });
      return { ok: true, how: "role:button submit/apply" };
    }
  } catch {
    // fall through
  }
  return { ok: false, how: "no submit button found" };
}

// Post-submit confirmation heuristic: confirmation copy or a telltale URL.
async function detectConfirmation(page: Page): Promise<string | null> {
  const rx =
    /thank you|application (?:was )?submitted|we(?:'|’)ve received your application|received your application|application received|successfully submitted/i;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if (/confirmation|thank[-_]?you|success/i.test(page.url())) {
        return `url: ${page.url()}`;
      }
      const body = await page.locator("body").innerText({ timeout: 3000 });
      const m = body.match(rx);
      if (m) return `page text: “${m[0]}”`;
    } catch {
      // page may be mid-navigation — retry until deadline
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

// ── Per-job flow ─────────────────────────────────────────────────────────────

type Deps = {
  loadApplyContext: typeof import("../lib/apply/core").loadApplyContext;
  setApplyStatus: typeof import("../lib/apply/core").setApplyStatus;
  appendApplyLog: typeof import("../lib/apply/core").appendApplyLog;
};

async function ensureTosAck(host: string): Promise<boolean> {
  const { getSetting, setSetting } = await import("../lib/settings/store");
  const tosKey = `tos:${host}`;
  if ((await getSetting(tosKey)) !== null) return true;

  console.log(`\n⚠  FIRST RUN against ${host}`);
  console.log(`   Automating form-fill / submit on a third-party ATS can violate its`);
  console.log(`   terms of service and, for account-based sites, risk an account ban.`);
  console.log(`   Dayspring runs ATTENDED — you watch, solve CAPTCHAs, and approve`);
  console.log(`   every submission before it happens.`);
  const ack = await prompt(`\n   Type exactly "I accept the risk for ${host}" to proceed: `);
  if (ack !== `I accept the risk for ${host}`) {
    console.log("   Not acknowledged — skipping this job.");
    return false;
  }
  await setSetting(tosKey, new Date().toISOString());
  return true;
}

async function applyOneJob(
  page: Page,
  jobId: string,
  deps: Deps,
): Promise<"submitted" | "manual" | "skipped" | "abandoned" | "error"> {
  const { loadApplyContext, setApplyStatus, appendApplyLog } = deps;

  const loaded = await loadApplyContext(jobId);
  if (!loaded.ok) {
    console.error(`\n✗ Job ${jobId}: ${loaded.error}`);
    return "error";
  }
  const { ctx } = loaded;
  const { detectAts, fillCommonForm } = await import("../lib/apply/ats-forms");
  const ats = detectAts(ctx.job.url!);
  const host = new URL(ctx.job.url!).host;

  if (!(await ensureTosAck(host))) return "skipped";

  const resumeLabel = ctx.resumePath
    ? `${ctx.resumePath}  (${
        { tailored: "tailored for THIS job", master: "primary master", settings: "static fallback" }[
          ctx.resumeSource!
        ]
      })`
    : "⚠ none — generate one on the job page or upload a master in Settings";

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   ${ctx.job.title} @ ${ctx.job.companyName}   [job ${jobId}]`);
  console.log(`   ${ctx.job.url}`);
  console.log(`   ATS: ${ats}`);
  console.log(`   Resume: ${resumeLabel}`);
  console.log(
    `   Tailored materials: bullets ${ctx.job.tailoredBullets ? "✓" : "—"}, cover letter ${ctx.job.coverLetter ? "✓" : "—"}`,
  );

  await setApplyStatus(jobId, "in_progress", `apply-assist opened (${ats})`);
  await page.goto(ctx.job.url!, { waitUntil: "domcontentloaded", timeout: 60_000 });

  if (ats === "workday") {
    await runWorkdayAssist(page, host, ctx.fields.email, appendApplyLog, jobId);
  } else {
    console.log(`\n   Autofilling…`);
    const res = await fillCommonForm(page, ctx);
    console.log(`   ✓ filled: ${res.filled.join(", ") || "(nothing matched)"}`);
    if (res.skipped.length) {
      console.log(`   – not found (fill manually if present): ${res.skipped.join(", ")}`);
    }
    await appendApplyLog(jobId, `autofilled: ${res.filled.join(", ")} [resume: ${ctx.resumeSource ?? "none"}]`);
  }

  // THE review gate — the human approves; the tool submits.
  console.log(`\n   ⏸  REVIEW GATE — in the browser: solve any CAPTCHA, answer EEO`);
  console.log(`      questions yourself, and fix anything the autofill missed.`);
  console.log(`      Then tell me what to do:`);
  console.log(`        go    → I click Submit for you`);
  console.log(`        done  → you already clicked Submit yourself`);
  console.log(`        skip  → move on WITHOUT submitting`);
  const answer = (await prompt(`\n      go / done / skip: `)).toLowerCase();

  if (answer === "go") {
    const clicked = await clickSubmit(page);
    if (!clicked.ok) {
      console.log(`   ✗ Couldn't find a Submit button (${clicked.how}).`);
      console.log(`     Click it yourself, then confirm below.`);
      const manual = await prompt(`     Type 'done' if you submitted, anything else to abandon: `);
      if (manual.toLowerCase() !== "done") {
        await setApplyStatus(jobId, "abandoned", "no submit button; user did not submit");
        return "abandoned";
      }
      const { setJobStatusCore } = await import("../lib/jobs/transition");
      await setJobStatusCore(jobId, "applied");
      await setApplyStatus(jobId, "submitted", "human submitted manually → applied");
      console.log(`   ✅ Recorded as applied.`);
      return "manual";
    }

    await appendApplyLog(jobId, `tool clicked submit (${clicked.how}) after human approval`);
    console.log(`   🖱  Clicked Submit (${clicked.how}). Watching for confirmation…`);
    const confirmed = await detectConfirmation(page);
    if (confirmed) {
      console.log(`   ✓ Confirmation detected — ${confirmed}`);
    } else {
      console.log(`   ? No clear confirmation appeared within 15s.`);
      const looks = await prompt(`     Does the page show it went through? [y/N] `);
      if (looks.toLowerCase() !== "y") {
        await setApplyStatus(jobId, "abandoned", "submit clicked but unconfirmed — check manually");
        console.log(`   Recorded as NOT submitted — verify on the site.`);
        return "abandoned";
      }
    }
    const { setJobStatusCore } = await import("../lib/jobs/transition");
    await setJobStatusCore(jobId, "applied"); // auto-creates the application row
    await setApplyStatus(jobId, "submitted", `approved → tool submitted${confirmed ? ` (${confirmed})` : ""}`);
    console.log(`   ✅ Recorded as applied. Nice.`);
    return "submitted";
  }

  if (answer === "done") {
    const { setJobStatusCore } = await import("../lib/jobs/transition");
    await setJobStatusCore(jobId, "applied");
    await setApplyStatus(jobId, "submitted", "human confirmed manual submit → applied");
    console.log(`   ✅ Recorded as applied.`);
    return "manual";
  }

  if (answer === "skip") {
    await setApplyStatus(jobId, "abandoned", "skipped at review gate");
    console.log(`   Skipped — pipeline status unchanged.`);
    return "skipped";
  }

  await setApplyStatus(jobId, "abandoned", "closed at review gate without submit");
  console.log(`   Recorded as not submitted. Pipeline status unchanged.`);
  return "abandoned";
}

// Workday account assist: surface the vaulted/master credential, auto-read the
// verification code from Gmail, and offer to vault a new account. The human
// drives the (per-tenant, highly variable) Workday form itself.
async function runWorkdayAssist(
  page: Page,
  host: string,
  email: string | null,
  appendApplyLog: (jobId: string, line: string) => Promise<void>,
  jobId: string,
) {
  void page;
  const { credentialForHost, getMasterPassword, addCredential, hasMasterPassword } =
    await import("../lib/vault/core");
  const { hasVaultKey } = await import("../lib/vault/crypto");
  const { hasGmail } = await import("../lib/integrations/gmail/client");
  const { waitForWorkdayCode } = await import("../lib/apply/workday-signup");

  if (!hasVaultKey() || !await hasMasterPassword()) {
    console.log(`\n   ⚠ Vault/master password not set — set them in Settings to use the`);
    console.log(`     one-password + auto-OTP flow. Continuing manually.`);
    return;
  }

  const existing = await credentialForHost(host);
  if (existing) {
    console.log(`\n   🔑 Existing ${host} account: ${existing.username}`);
    console.log(`      Password: ${existing.password}`);
    console.log(`      → Sign in with these in the browser.`);
    await appendApplyLog(jobId, `surfaced vaulted credential for ${host}`);
  } else {
    const master = (await getMasterPassword())!;
    const username = email ?? (await prompt(`\n   Email to register with: `));
    console.log(`\n   🆕 No ${host} account yet. Create one in the browser:`);
    console.log(`      Email:    ${username}`);
    console.log(`      Password: ${master}   (your master password)`);
    const store = await prompt(`\n   After you submit the signup form, press Enter to store this credential… `);
    void store;
    const res = await addCredential({ site: `Workday — ${host.split(".")[0]}`, host, username });
    console.log(res.ok ? `      ✓ Credential vaulted.` : `      (not stored: ${res.error})`);
    await appendApplyLog(jobId, `workday signup credential ${res.ok ? "vaulted" : "not vaulted"}`);
  }

  // Auto-OTP.
  if (await hasGmail()) {
    const wantOtp = await prompt(
      `\n   Trigger the verification email in the browser, then press Enter and I'll read the code from Gmail (or 's' to skip): `,
    );
    if (wantOtp.toLowerCase() !== "s") {
      console.log(`   ⏳ Watching Gmail for the Workday code…`);
      const code = await waitForWorkdayCode({ sinceMs: Date.now() - 60_000 });
      if (code) {
        console.log(`\n   🔢 Verification code: ${code}   → enter it in the browser.`);
        appendApplyLog(jobId, "auto-read workday OTP from gmail");
      } else {
        console.log(`   (No code found in the window — grab it from the dashboard widget or inbox.)`);
      }
    }
  }
}

// ── Main: one browser session, N jobs ────────────────────────────────────────

async function main() {
  const jobIds = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
  if (jobIds.length === 0) {
    console.error("Usage: npm run apply -- <jobId> [jobId2 …]");
    process.exit(1);
  }

  const { prepareCli } = await import("../lib/env");
  await prepareCli();

  const { loadApplyContext, setApplyStatus, appendApplyLog } = await import(
    "../lib/apply/core"
  );
  const deps: Deps = { loadApplyContext, setApplyStatus, appendApplyLog };

  console.log(`\n🌅 Dayspring apply-assist — ATTENDED, approve→submit`);
  console.log(`   ${jobIds.length} job${jobIds.length === 1 ? "" : "s"} queued: ${jobIds.join(", ")}`);
  console.log(`\n   This drives a browser on third-party sites. You stay in control:`);
  console.log(`   it fills, you review each application, and it submits only after`);
  console.log(`   you type 'go' — per job, every time.`);
  const start = await prompt(`\n   Open the browser and begin? [y/N] `);
  if (start.toLowerCase() !== "y") {
    console.log("   Aborted — nothing changed.");
    process.exit(0);
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: false });
  const tally: Record<string, number> = {};

  try {
    for (const jobId of jobIds) {
      const page = await browser.newPage();
      try {
        const outcome = await applyOneJob(page, jobId, deps);
        tally[outcome] = (tally[outcome] ?? 0) + 1;
      } catch (err) {
        tally.error = (tally.error ?? 0) + 1;
        await appendApplyLog(jobId, `error: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`\n   ✗ Job ${jobId}: ${err instanceof Error ? err.message : err}`);
      } finally {
        // Keep the last page open until the user releases the browser below.
        if (jobId !== jobIds[jobIds.length - 1]) await page.close();
      }
    }
  } finally {
    const summary = Object.entries(tally)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    console.log(`\n   ── Run summary: ${summary || "nothing processed"}`);
    const keep = await prompt(`\n   Close the browser now? [Y/n] `);
    if (keep.toLowerCase() !== "n") await browser.close();
  }
}

main().catch((err) => {
  console.error("apply-assist failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
