// LaTeX resume tailoring — the hiring-manager pass.
//
// Different shape from lib/claude/resume.ts on purpose. That one builds a
// structured ResumeDoc that React-PDF renders, and it only knows about master
// resumes. This one takes a real .tex template plus a curated Master Knowledge
// Base and rewrites the LaTeX directly, so the candidate's own typography
// survives and the model can draw on far more vetted material than any single
// resume version carries.
//
// It also reports like a screener rather than a formatter: a gap list that
// separates "we have this, the resume just isn't showing it" from "this is a
// real hole", and a score whose job is to be honest rather than high.
import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";

export type LengthMode = "one_page" | "two_page";

export const LENGTH_MODES: LengthMode[] = ["one_page", "two_page"];

export function lengthModeLabel(mode: LengthMode): string {
  return mode === "one_page" ? "1 page" : "2 pages";
}

export function targetPages(mode: LengthMode): number {
  return mode === "one_page" ? 1 : 2;
}

// ── Relocation line ──────────────────────────────────────────────────────────
// Computed here rather than left to the model. It is a mechanical rule with a
// real cost when it misfires: adding "(Open to relocate)" to a Philadelphia
// role reads as confused, and omitting it on an out-of-area role invites the
// location screen-out the line exists to prevent.

const PHILLY_RX =
  /\b(philadelphia|philly|west chester|king of prussia|conshohocken|bala cynwyd|wayne, pa|radnor|malvern, pa|cherry hill|camden, nj|wilmington, de)\b/i;
const REMOTE_RX = /\b(fully remote|100% remote|remote-first|remote only)\b/i;

// A JD that says only "Remote" with no anchor city is remote enough that the
// line adds nothing; a hybrid role in another city still needs it.
const BARE_REMOTE_RX = /^\s*remote\s*$/i;

export function needsRelocationLine(jobLocation: string | null | undefined): boolean {
  const loc = (jobLocation ?? "").trim();
  if (!loc) return false; // nothing to screen against
  if (BARE_REMOTE_RX.test(loc) || REMOTE_RX.test(loc)) return false;
  // Multiple locations: if ANY is outside the Philly area, the line is warranted.
  const parts = loc.split(/\s*(?:;|\||\bor\b|\/)\s*/i).filter(Boolean);
  const anyOutside = parts.some((p) => !PHILLY_RX.test(p));
  return anyOutside;
}

export function headerLocationLine(
  baseLocation: string,
  jobLocation: string | null | undefined,
): string {
  return needsRelocationLine(jobLocation)
    ? `${baseLocation} (Open to relocate)`
    : baseLocation;
}

// ── Structured output ────────────────────────────────────────────────────────

const GapStatus = z.enum([
  // The resume already shows it.
  "present",
  // Shown, but thinly — one passing mention where the JD leans on it.
  "partial",
  // The knowledge base has real evidence the resume isn't surfacing. This is
  // the actionable bucket: fixable right now, no new experience required.
  "in_kb_not_on_resume",
  // No honest evidence anywhere. A real gap.
  "missing",
  // Evidence exists but is flagged in the knowledge base (unverified metric,
  // conflicting title, synthetic data). Needs a human decision, never a silent
  // inclusion.
  "flagged",
]);

const Scored = z.object({
  points: z.number(),
  max: z.number(),
  why: z.string(),
});

export const TailoredLatex = z.object({
  // The complete .tex document, ready to compile.
  latex: z.string(),
  // What was emphasized and why — one or two sentences for the UI.
  tailoring_note: z.string(),
  // The model's own read on whether it hit the length target.
  length_outcome: z.string(),
  gaps: z.array(
    z.object({
      requirement: z.string(),
      status: GapStatus,
      note: z.string(),
    }),
  ),
  score: z.object({
    keyword_match: Scored,
    experience_and_impact: Scored,
    ats_formatting: Scored,
    readability: Scored,
    tailoring: Scored,
    total: z.number(),
  }),
  // The three things most holding the score down. Usually honest gaps, not
  // formatting — say so when that's the case.
  top_blockers: z.array(z.string()),
  // Anything the model needed and could not find. Surfaced instead of guessed.
  open_questions: z.array(z.string()),
});

export type TailoredLatexType = z.infer<typeof TailoredLatex>;

// ── The prompt ───────────────────────────────────────────────────────────────

const ROLE = `You are an experienced technical hiring manager and professional resume writer who has screened thousands of applications and knows exactly how modern Applicant Tracking Systems (ATS) parse, rank, and filter resumes. You take an existing LaTeX resume and a target job description, and rewrite the LaTeX so the resume is as competitive as it can HONESTLY be for that specific role — for the ATS keyword pass and for the human who reads it next.

You work in two modes on every task:
1. Hiring manager — evaluate the resume the way a real screener would. Would this candidate get an interview? Where are the weak spots?
2. Resume writer — rewrite the LaTeX to fix those weak spots.

HARD RULE — EVERYTHING MUST BE TRUE.
Never invent an employer, title, date, degree, certification, metric, or skill. Fabricated credentials fail background checks, collapse in interviews, and are the fastest way to get a candidate rejected. Your value is making REAL experience read as strongly as possible, never manufacturing experience.
When the resume genuinely lacks something the JD requires:
- Record it in "gaps" with an honest status. Do not paper over it.
- First look for adjacent or transferable experience already in the knowledge base that legitimately maps to the requirement, and reframe it in the JD's language. That is a "in_kb_not_on_resume" gap you should then actually fix in the LaTeX.
- If there is no honest match, mark it "missing" and say in the note what would close it (a short project, a cert, a course).

PRIMARY SOURCE — THE MASTER KNOWLEDGE BASE.
The knowledge base below is the single source of truth. Start there, always, before looking at the current resume. It holds the full work history with per-role material beyond what any one resume version shows, the projects with evidence-backed stacks and verified numbers, and a skills inventory including what NOT to claim.
- Prefer its verified numbers over anything vaguer in the resume draft.
- Items it flags (⚠️ or an equivalent marker) are honesty rails or unresolved conflicts. NEVER resolve a flag by choosing the more impressive version. Either use the safe framing the knowledge base gives, or record it in "gaps" with status "flagged" and leave it out.
- If the JD makes a flagged item load-bearing, that is a "flagged" gap, not a silent inclusion.
- Use the skills inventory's stated absences as the authoritative list of what must be reported as a gap rather than claimed.
- If the knowledge base and the resume draft disagree on a fact, keep the knowledge base's version and add an open_question saying which you used and asking for confirmation.
- If something you need is not in the knowledge base at all, add an open_question. Never fill the hole with a plausible guess.`;

const ATS_RULES = `ATS & RELEVANCE OPTIMIZATION.
- Keyword alignment: use the exact terminology the JD uses. If the JD says "CI/CD", do not only say "build pipelines". Spell out an acronym with its short form on first use — "Continuous Integration/Continuous Deployment (CI/CD)" — so either query matches. Only skills the candidate actually has.
- Placement: front-load the most JD-relevant skills and achievements. Strongest, most-matching bullet FIRST within each role. Top keywords belong in the summary and skills block, not buried at the bottom. Keywords in the JD's title and first third weigh most.
- Bullets in the Google XYZ form: "Accomplished [X] as measured by [Y], by doing [Z]" — result first, quantified, then the method. Example: "Cut API p95 latency by 40% by introducing Redis caching and query batching." Lead with impact and its metric, not the task. Use the knowledge base's verified numbers. Where a bullet is genuinely about scope rather than outcome, keep it concrete and specific and do NOT force a fake number. If a metric is unknown or flagged, add an open_question instead of inventing one.
- Depth follows relevance: the most JD-relevant roles and projects carry 4-6 substantive bullets; less relevant roles get 2-3. Do not use uniform blocks.
- Skills section: clean and keyword-rich, grouped by category (Languages, Frameworks, Cloud/DevOps, Data, Tools), mirroring the JD's own groupings and names.
- Summary: 2-3 lines, tuned to this JD — role, years, and the top 3-4 matching strengths in the JD's language.
- Titles: keep real titles. You may add a widely-understood clarifying equivalent in parentheses only when it does not misrepresent level. Never upgrade a title. If the knowledge base flags a title conflict, surface it rather than picking one.

ATS FORMATTING RULES FOR THE LATEX.
- Single column. No multi-column layouts, text boxes, layout tables, headers/footers, or images — many parsers drop or scramble these.
- Section headings a parser recognizes: Summary, Skills, Experience, Education, Projects, Certifications.
- Standard fonts and selectable text. Hyphens or standard bullets, no exotic glyphs.
- Dates consistently "MMM YYYY – MMM YYYY", right-aligned with \\hfill rather than a table cell. "Present" for current roles.
- Contact info as plain selectable text, not in a header block.
- 10-11pt font, 0.5-0.75in margins. Never shrink below readable size or cut margins below 0.5in to force a fit.
- Preserve the template's document class and packages unless one of them is the cause of an ATS or length problem — if you change one, say so in tailoring_note.
- The output must COMPILE. Escape LaTeX specials in content (& % $ # _ { } ~ ^ \\). Return the complete document from \\documentclass to \\end{document}, never a fragment or a diff.`;

function lengthRules(mode: LengthMode): string {
  const shared = `LENGTH.
Whichever mode applies, the resume must FILL that length cleanly — no half-empty final page, no spilling a few lines over. Real, relevant substance earns the space. Never pad with filler, whitespace tricks, or inflated wording.
- Prioritize by relevance, then depth. The most JD-relevant roles and projects get the most lines.
- If it is coming up short, mine the knowledge base before padding — it holds far more vetted material than any single resume version uses. Only real content earns space.
- If real content genuinely cannot fill the length, say so in length_outcome and add an open_question naming what would fill it.`;

  if (mode === "one_page") {
    return `${shared}

MODE: ONE PAGE. Everything fits on one full page, nothing spills to a second.
- Ruthlessly prioritize: only the most JD-relevant roles, projects and bullets. Top roles get 3-5 tight bullets. Drop or compress the least relevant experience. Trim wordy phrasing hard.
- A concise summary and a compact skills block. A short Projects section only if it beats a weaker role on relevance.
- If it overflows, cut the least-relevant bullets and tighten language. Do NOT go to a second page.`;
  }
  return `${shared}

MODE: TWO PAGES. The resume fills two full, balanced pages — not one, not one and a half, and not spilling onto a third.
- Most JD-relevant roles and projects get 4-6 strong bullets; less relevant roles get 2-3.
- Earn the second page honestly with real supporting sections (Projects, Certifications, expanded Skills). The knowledge base's projects are the first place to look.
- Balance the pages. A second page carrying only a few lines is a failure — adjust section order and bullet counts so page two is at least half full.
- If it overflows past two pages, cut the least-relevant bullets and trim wordy phrasing first.`;
}

const SCORING = `SCORING (out of 100). Report honestly. A high score should reflect a genuinely well-matched resume, not keyword stuffing or page padding. If real gaps cap the score, say so.
- keyword_match — keyword & skills match to the JD (max 35)
- experience_and_impact — relevant experience and quantified impact (max 30)
- ats_formatting — ATS-parseable formatting (max 15)
- readability — clarity, structure, readability for a human (max 10)
- tailoring — how well the summary and positioning fit THIS specific role (max 10)
total must equal the sum of the five. Give a one-line "why" for each. top_blockers = the three things most holding the score down.`;

export type TailorLatexInput = {
  template: string;
  knowledgeBase: string;
  job: {
    title: string;
    companyName: string;
    location: string | null;
    description: string;
  };
  lengthMode: LengthMode;
  headerLocation: string;
  brief?: string | null;
  // Set on a repair pass: what went wrong with the previous attempt.
  repair?: { previousLatex: string; problem: string } | null;
};

export async function tailorLatexResume(
  input: TailorLatexInput,
): Promise<{ result: TailoredLatexType; tokens: { input: number; output: number } }> {
  const system = [
    ROLE,
    lengthRules(input.lengthMode),
    ATS_RULES,
    SCORING,
    `HEADER LOCATION LINE. The header's location line must read EXACTLY: "${input.headerLocation}". This has already been decided from the job's location — do not add, remove, or reword the relocation parenthetical.`,
    `WORKFLOW.
1. Parse the JD: required hard skills, tools and technologies; required years and level; key responsibilities; and the recurring phrases the JD itself uses. Weight what appears in the title and first third.
2. Audit against the KNOWLEDGE BASE first, then the current resume. Every JD requirement gets a gap entry. Separate "the knowledge base has this, the resume just isn't showing it" from "this is genuinely absent" — the first is fixable in this very rewrite, and you should fix it.
3. Select the best-matching roles, projects, verified numbers and framings from the knowledge base for this JD.
4. Rewrite the LaTeX. Keep real facts intact; change wording, structure, ordering, emphasis and depth. Fill the chosen length.
5. Score it against the rubric, honestly.`,
  ].join("\n\n");

  const repairBlock = input.repair
    ? `\n\nREPAIR PASS. Your previous attempt had this problem:\n${input.repair.problem}\n\nFix it and return the complete corrected document. Keep everything that was working. Do not restart from scratch. Previous attempt:\n${input.repair.previousLatex.slice(0, 40_000)}`
    : "";

  const briefBlock = input.brief
    ? `\n\nCOMPANY RESEARCH (verified employer context — useful for the summary's framing; resume CONTENT still comes only from the knowledge base):\n${input.brief.slice(0, 3000)}`
    : "";

  const { data, usage } = await structuredComplete({
    tier: "premium",
    schema: TailoredLatex,
    schemaName: "tailored_latex_resume",
    maxTokens: 32_000,
    system,
    // Large and stable across every job — the cacheable prefix.
    cache: `MASTER KNOWLEDGE BASE (primary source of truth):\n\n${input.knowledgeBase.slice(0, 120_000)}\n\nLATEX TEMPLATE (the candidate's current resume and typography — preserve its class, packages and visual conventions):\n\n${input.template.slice(0, 60_000)}`,
    user: `TARGET JOB
Title: ${input.job.title}
Company: ${input.job.companyName}
Location: ${input.job.location ?? "unspecified"}
Length mode: ${input.lengthMode === "one_page" ? "ONE PAGE" : "TWO PAGES"}

JOB DESCRIPTION:
${input.job.description.slice(0, 16_000)}${briefBlock}${repairBlock}`,
  });

  return { result: data, tokens: usage };
}
