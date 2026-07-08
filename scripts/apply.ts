// Attended apply-assist. Opens a HEADED browser you watch, autofills the form
// from your profile + tailored materials + resume, then STOPS at hard human
// gates: solve any CAPTCHA yourself, review everything, and YOU submit. Nothing
// is ever submitted automatically.
//
// Usage: npm run apply -- <jobId>
export {}; // module scope

import { createInterface } from "node:readline";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    }),
  );
}

async function main() {
  const jobId = Number(process.argv[2]);
  if (!Number.isFinite(jobId)) {
    console.error("Usage: npm run apply -- <jobId>");
    process.exit(1);
  }

  const { loadLocalEnv } = await import("../lib/env");
  loadLocalEnv();

  const { loadApplyContext, setApplyStatus, appendApplyLog } = await import(
    "../lib/apply/core"
  );
  const loaded = loadApplyContext(jobId);
  if (!loaded.ok) {
    console.error(`✗ ${loaded.error}`);
    process.exit(1);
  }
  const { ctx } = loaded;
  const { detectAts, fillCommonForm } = await import("../lib/apply/ats-forms");
  const ats = detectAts(ctx.job.url!);
  const host = new URL(ctx.job.url!).host;

  // Per-site ToS acknowledgement — required once per host before automating
  // against it. Automating ATS interaction can violate site terms; this is a
  // deliberate, logged opt-in.
  const { db } = await import("../lib/db");
  const { settings } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const tosKey = `tos:${host}`;
  const already = db.select().from(settings).where(eq(settings.key, tosKey)).get();
  if (!already) {
    console.log(`\n⚠  FIRST RUN against ${host}`);
    console.log(`   Automating form-fill / signup on a third-party ATS can violate its`);
    console.log(`   terms of service and, for account-based sites, risk an account ban.`);
    console.log(`   Dayspring runs ATTENDED only — you watch, solve CAPTCHAs, and submit.`);
    const ack = await prompt(`\n   Type exactly "I accept the risk for ${host}" to proceed: `);
    if (ack !== `I accept the risk for ${host}`) {
      console.log("   Not acknowledged — aborting.");
      process.exit(0);
    }
    db.insert(settings)
      .values({ key: tosKey, value: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .onConflictDoNothing()
      .run();
  }

  console.log(`\n🌅 Dayspring apply-assist — ATTENDED`);
  console.log(`   ${ctx.job.title} @ ${ctx.job.companyName}`);
  console.log(`   ${ctx.job.url}`);
  console.log(`   ATS: ${ats}${ats === "workday" ? " (account required — see M20)" : ""}`);
  console.log(`   Resume: ${ctx.resumePath ?? "⚠ not set (set resumePath in Settings)"}`);
  console.log(`   Tailored materials: bullets ${ctx.job.tailoredBullets ? "✓" : "—"}, cover letter ${ctx.job.coverLetter ? "✓" : "—"}`);
  console.log(
    `\n   This drives a browser on a third-party site. You stay in control:`,
  );
  console.log(`   it fills, then pauses for you to solve CAPTCHAs and to submit.`);
  const go = await prompt(`\n   Open the browser and begin? [y/N] `);
  if (go.toLowerCase() !== "y") {
    console.log("   Aborted — nothing changed.");
    process.exit(0);
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  setApplyStatus(jobId, "in_progress", `apply-assist opened (${ats})`);

  try {
    await page.goto(ctx.job.url!, { waitUntil: "domcontentloaded", timeout: 60_000 });

    if (ats === "workday") {
      await runWorkdayAssist(page, host, ctx.fields.email, appendApplyLog, jobId, prompt);
    } else {
      console.log(`\n   Autofilling…`);
      const res = await fillCommonForm(page, ctx);
      console.log(`   ✓ filled: ${res.filled.join(", ") || "(nothing matched)"}`);
      if (res.skipped.length) {
        console.log(`   – not found (fill manually if present): ${res.skipped.join(", ")}`);
      }
      appendApplyLog(jobId, `autofilled: ${res.filled.join(", ")}`);
    }

    // Gate 1 — CAPTCHA / anything the autofill couldn't do.
    console.log(
      `\n   ⏸  GATE 1 — Review the form in the browser. Solve any CAPTCHA,`,
    );
    console.log(`      fix any fields, and answer EEO questions yourself.`);
    await prompt(`      Press Enter when the form is ready to submit… `);

    // Gate 2 — submission is the human's, always.
    console.log(`\n   ⏸  GATE 2 — Final submit is yours.`);
    const done = await prompt(
      `      Type 'submitted' AFTER you've clicked submit in the browser,\n      or anything else to record it as not submitted: `,
    );

    if (done.toLowerCase() === "submitted") {
      const { setJobStatusCore } = await import("../lib/jobs/transition");
      setJobStatusCore(jobId, "applied"); // auto-creates the application row
      setApplyStatus(jobId, "submitted", "human confirmed submit → applied");
      console.log(`\n   ✅ Recorded as applied. Nice.`);
    } else {
      setApplyStatus(jobId, "abandoned", "closed without submit");
      console.log(`\n   Recorded as not submitted. Pipeline status unchanged.`);
    }
  } catch (err) {
    appendApplyLog(jobId, `error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`\n   ✗ ${err instanceof Error ? err.message : err}`);
  } finally {
    const keep = await prompt(`\n   Close the browser now? [Y/n] `);
    if (keep.toLowerCase() !== "n") await browser.close();
  }
}

// Workday account assist: surface the vaulted/master credential to paste, then
// auto-read the verification code from Gmail, and offer to vault a new account.
// The human drives the (per-tenant, highly variable) Workday form.
async function runWorkdayAssist(
  page: import("playwright").Page,
  host: string,
  email: string | null,
  appendApplyLog: (jobId: number, line: string) => void,
  jobId: number,
  prompt: (q: string) => Promise<string>,
) {
  const { credentialForHost, getMasterPassword, addCredential, hasMasterPassword } =
    await import("../lib/vault/core");
  const { hasVaultKey } = await import("../lib/vault/crypto");
  const { hasGmail } = await import("../lib/integrations/gmail/client");
  const { waitForWorkdayCode } = await import("../lib/apply/workday-signup");

  if (!hasVaultKey() || !hasMasterPassword()) {
    console.log(
      `\n   ⚠ Vault/master password not set — set them in Settings to use the`,
    );
    console.log(`     one-password + auto-OTP flow. Continuing manually.`);
    return;
  }

  const existing = credentialForHost(host);
  if (existing) {
    console.log(`\n   🔑 Existing ${host} account: ${existing.username}`);
    console.log(`      Password: ${existing.password}`);
    console.log(`      → Sign in with these in the browser.`);
    appendApplyLog(jobId, `surfaced vaulted credential for ${host}`);
  } else {
    const master = getMasterPassword()!;
    const username = email ?? (await prompt(`\n   Email to register with: `));
    console.log(`\n   🆕 No ${host} account yet. Create one in the browser:`);
    console.log(`      Email:    ${username}`);
    console.log(`      Password: ${master}   (your master password)`);
    const store = await prompt(`\n   After you submit the signup form, press Enter to store this credential… `);
    void store;
    const res = addCredential({ site: `Workday — ${host.split(".")[0]}`, host, username });
    console.log(res.ok ? `      ✓ Credential vaulted.` : `      (not stored: ${res.error})`);
    appendApplyLog(jobId, `workday signup credential ${res.ok ? "vaulted" : "not vaulted"}`);
  }

  // Auto-OTP.
  if (hasGmail()) {
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

main().catch((err) => {
  console.error("apply-assist failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
