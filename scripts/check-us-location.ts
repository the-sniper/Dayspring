// Sanity check for the US-only post filter.
// Run: npx tsx scripts/check-us-location.ts
import { isUsOpening, usLocationVerdict } from "../shared/us-location";

let failed = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

console.log("── usLocationVerdict: keep ──");
eq("explicit US", usLocationVerdict("Hiring a Senior Engineer, United States", null), "us");
eq("city, state code", usLocationVerdict("Open role in Austin, TX", null), "us");
eq("state name", usLocationVerdict("We're hiring in California", null), "us");
eq("remote (US)", usLocationVerdict("Fullstack Engineer — Remote (US)", null), "us");
eq("US-based", usLocationVerdict("Looking for a US-based FDE", null), "us");
eq("timezone", usLocationVerdict("Must overlap EST hours", null), "us");
eq("work auth", usLocationVerdict("We sponsor H1B for this role", null), "us");
eq("location field only", usLocationVerdict("We're hiring!", "San Francisco"), "us");
eq("US among several", usLocationVerdict("Hiring in London, Berlin and New York", null), "us");

console.log("\n── usLocationVerdict: veto ──");
eq("India city", usLocationVerdict("Hiring Fullstack devs in Bengaluru", null), "non_us");
eq("India idiom", usLocationVerdict("Immediate joiners preferred. Share your CTC.", null), "non_us");
eq("notice period", usLocationVerdict("What is your notice period?", "Remote"), "non_us");
eq("rupee", usLocationVerdict("Salary ₹18 LPA", null), "non_us");
eq("UK", usLocationVerdict("Frontend role based in London", null), "non_us");
eq("EMEA", usLocationVerdict("Hiring across EMEA", null), "non_us");
eq("Dubai", usLocationVerdict("Openings in Dubai", null), "non_us");

console.log("\n── usLocationVerdict: the noise case ──");
// The JÆT | Global post: many roles across four departments, location "Remote",
// no country named anywhere. This is the exact shape being filtered out.
const jaet = `JÆT | Global is Hiring

We're entering our next phase of growth and are looking for passionate individuals who want to build meaningful technology, solve real-world problems, and grow alongside an ambitious team.

Whether you're an engineer, a business professional, or an experienced leader, there's an opportunity to make an impact.

Engineering
- Backend Developer
- Full Stack Developer
- AI/ML Developer
- UI/UX Designer
- Cybersecurity Specialist`;
eq("bare Remote, no country", usLocationVerdict(jaet, "Remote"), "unknown");
eq("no location at all", usLocationVerdict("We're hiring engineers! DM me.", null), "unknown");
eq("empty", usLocationVerdict(null, null), "unknown");

console.log("\n── isUsOpening (model + deterministic) ──");
eq("model yes, no signal → keep", isUsOpening(true, "unknown"), true);
eq("model no, US signal → keep", isUsOpening(false, "us"), true);
eq("model yes, non-US veto → drop", isUsOpening(true, "non_us"), false);
eq("model no, no signal → drop", isUsOpening(false, "unknown"), false);
eq("unextracted (null) + US signal → keep", isUsOpening(null, "us"), true);
eq("unextracted (null) + nothing → drop", isUsOpening(null, "unknown"), false);

console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILURES`}`);
process.exit(failed === 0 ? 0 : 1);
