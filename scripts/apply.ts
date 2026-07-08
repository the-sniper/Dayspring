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
      console.log(
        `\n   Workday needs an account + OTP flow (M20). For now, complete this one manually in the open window.`,
      );
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

main().catch((err) => {
  console.error("apply-assist failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
