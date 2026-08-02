// Throwaway sanity check for the two pure modules added in pass-4.
// Run: npx tsx scripts/check-apply-logic.ts
import { classifyQuestion, isReusableAnswer } from "../lib/apply/answer-class";
import { extractApplyEmail } from "../lib/apply/email-apply";

let failed = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

console.log("── classifyQuestion ──");
eq("sponsorship (plain)", classifyQuestion("Will you now or in the future require sponsorship?"), "sponsorship");
eq("sponsorship beats authorization", classifyQuestion("Are you legally authorized to work in the US without sponsorship?"), "sponsorship");
eq("authorization alone", classifyQuestion("Are you legally authorized to work in the United States?"), "work_authorization");
eq("relocation", classifyQuestion("Are you willing to relocate for this role?"), "relocation");
eq("salary", classifyQuestion("What are your salary expectations?"), "salary_expectation");
eq("years", classifyQuestion("How many years of React experience do you have?"), "years_experience");
eq("notice", classifyQuestion("What is your notice period?"), "notice_period");
eq("referral", classifyQuestion("How did you hear about us?"), "referral_source");
eq("clearance", classifyQuestion("Do you hold an active security clearance?"), "clearance");
eq("essay is other", classifyQuestion("Why are you interested in this role?"), "other");

console.log("\n── isReusableAnswer (the replay bug) ──");
eq("generic essay NOT reusable", isReusableAnswer("Why are you interested in this role?", "I love what you're building in developer tooling and..."), false);
eq("named essay NOT reusable", isReusableAnswer("Why do you want to work at Vercel?", "Vercel's edge platform is..."), false);
eq("what excites you NOT reusable", isReusableAnswer("What excites you most about this opportunity?", "The agent infra work"), false);
eq("sponsorship IS reusable", isReusableAnswer("Will you require sponsorship?", "No"), true);
eq("salary IS reusable", isReusableAnswer("Expected salary", "$180,000"), true);
eq("referral NOT reusable", isReusableAnswer("How did you hear about us?", "A friend who works there"), false);
eq("long unclassified NOT reusable", isReusableAnswer("Describe a hard technical decision", "x".repeat(200)), false);
eq("short unclassified IS reusable", isReusableAnswer("Do you have a GitHub with public work?", "Yes"), true);

console.log("\n── extractApplyEmail ──");
eq("mailto wins", extractApplyEmail('Apply here: <a href="mailto:careers@acme.com">careers</a> or ping bob@acme.com'), "careers@acme.com");
eq("jobs@ preferred", extractApplyEmail("Questions? bob@acme.com. Send applications to jobs@acme.com."), "jobs@acme.com");
eq("press@ rejected", extractApplyEmail("Contact press@acme.com for media."), null);
eq("no-reply rejected", extractApplyEmail("Sent from noreply@acme.com"), null);
eq("bare address needs apply phrasing", extractApplyEmail("Reach out to bob@acme.com sometime."), null);
eq("bare address with phrasing", extractApplyEmail("Send your resume to bob@acme.com"), "bob@acme.com");
eq("no email", extractApplyEmail("Apply on our careers page."), null);
eq("null input", extractApplyEmail(null), null);

console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILURES`}`);
process.exit(failed === 0 ? 0 : 1);
