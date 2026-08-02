// Sanity check for the deterministic parts of the LaTeX resume pipeline.
// The model's judgment can't be unit-tested; these can, and each one has a real
// failure mode: a bad log regex silently reports "no page count", a bad
// relocation rule puts "(Open to relocate)" on a Philadelphia job.
//
// Run: npx tsx scripts/check-latex-resume.ts
import {
  headerLocationLine,
  needsRelocationLine,
  targetPages,
} from "../lib/claude/latex-resume";
import { firstTexError, lengthProblem, pageCountFromLog } from "../lib/resumes/latex";

let failed = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};
const truthy = (label: string, got: unknown) => {
  const ok = Boolean(got);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}  got=${JSON.stringify(got)}`);
};

console.log("── pageCountFromLog (real pdflatex output) ──");
eq(
  "two pages",
  pageCountFromLog("Output written on resume.pdf (2 pages, 13609 bytes)."),
  2,
);
eq("one page (singular)", pageCountFromLog("Output written on resume.pdf (1 page, 9001 bytes)."), 1);
eq("path with spaces", pageCountFromLog("Output written on /tmp/a b/resume.pdf (3 pages, 1 bytes)."), 3);
eq("no such line", pageCountFromLog("Transcript written on resume.log."), null);

console.log("\n── firstTexError (-file-line-error format) ──");
const badLog = `(./bad.aux)
./resume.tex:3: Undefined control sequence.
l.3 \\undefinedmacro

./resume.tex:3:  ==> Fatal error occurred, no output PDF file produced!`;
truthy("finds file:line errors", firstTexError(badLog)?.startsWith("./resume.tex:3:"));
truthy("still finds classic ! errors", firstTexError("! Missing $ inserted.\nl.9 x")?.startsWith("!"));
eq("clean log has no error", firstTexError("Output written on resume.pdf (1 page, 1 bytes)."), null);

console.log("\n── needsRelocationLine ──");
eq("out of state", needsRelocationLine("Austin, TX"), true);
eq("philadelphia", needsRelocationLine("Philadelphia, PA"), false);
eq("philly metro", needsRelocationLine("West Chester, PA"), false);
eq("bare remote", needsRelocationLine("Remote"), false);
eq("fully remote", needsRelocationLine("Fully Remote (US)"), false);
eq("no location", needsRelocationLine(null), false);
eq("multi, one outside", needsRelocationLine("Philadelphia, PA or New York, NY"), true);
eq("multi, all local", needsRelocationLine("Philadelphia, PA / Conshohocken, PA"), false);

console.log("\n── headerLocationLine ──");
eq(
  "appends for out of area",
  headerLocationLine("Philadelphia, PA 19104", "San Francisco, CA"),
  "Philadelphia, PA 19104 (Open to relocate)",
);
eq(
  "leaves local alone",
  headerLocationLine("Philadelphia, PA 19104", "Philadelphia, PA"),
  "Philadelphia, PA 19104",
);

console.log("\n── lengthProblem ──");
eq("on target is silent", lengthProblem(1, 1), null);
truthy("too long", lengthProblem(2, 1)?.includes("Cut the least JD-relevant"));
truthy("one page when two wanted", lengthProblem(1, 2)?.includes("at least half full"));
truthy("three when two wanted", lengthProblem(3, 2)?.includes("Cut the least JD-relevant"));
eq("targetPages one", targetPages("one_page"), 1);
eq("targetPages two", targetPages("two_page"), 2);

console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILURES`}`);
process.exit(failed === 0 ? 0 : 1);
