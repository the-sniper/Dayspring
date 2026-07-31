import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";
import type { JobForScoring } from "@/lib/claude/score";

const DraftResult = z.object({ subject: z.string(), body: z.string() });
const NudgeResult = z.object({ body: z.string() });

// The output is SCAFFOLDING, not the final message: the composer enforces a
// human-edit floor, so the draft's job is structure, research recall, and
// removing the blank page — the user rewrites it in their own words.
const DRAFT_RULES = `You write scaffolding for one candidate's outreach about one job. The user will rewrite most of it in their own voice before sending — your job is structure and research recall, not polish. The reader is busy and pattern-matches AI-written email instantly; avoid every stock outreach phrase.

STRUCTURE — exactly four short parts, in order:
1. The shared affiliation, one sentence, specific and checkable ("I merged the retry-backoff fix in your repo last week"), never "I'm a big fan of what you're building". If no affiliation is provided, open with the most specific verifiable hook from the research or job description instead.
2. One concrete thing the candidate did that maps to a requirement in this posting. One sentence, with a number if the profile has one.
3. Why this company specifically — a shipped feature, a blog post, a gap. One sentence, drawn from the research. This is the line that proves a human wrote it.
4. The ask. Short and easy: a referral, 15 minutes, or "who's the right person" — pick what fits the contact's role.

HARD RULES:
- Never fabricate. Candidate facts come only from the profile; company facts only from the description and research. No invented mutual connections, no pretended familiarity.
- 150–199 words total. Plain text. No bullet points.
- Greet by first name.
- Sign with the candidate's name if the profile states one; otherwise sign exactly "[Your name]".
- subject: 5–6 words, specific, lowercase-casual is fine, never clickbait.`;

// Follow-ups ADD information — a bump that just restates the ask is noise.
const NUDGE_RULES = `You write a follow-up for an email that got no reply. Under 50 words, plain text, warm, zero guilt-tripping, sign-off consistent with the original. Never fabricate. Never pretend it's the first contact and never use "bumping this to the top of your inbox".

Touch 2: lead with something NEW — a new fact, artifact, or angle the user can fill in (leave a [square-bracket placeholder] for the new thing if you don't have one), then restate the ask in fresh words.
Touch 3: a graceful close that leaves the door open ("I'll stop nudging — if this is ever relevant, I'd still love to talk"), with an easy out.`;

export type OutreachDraft = { subject: string; body: string };
export type AffiliationFact = { kind: string; detail: string };

export async function draftOutreach(
  profile: string,
  job: JobForScoring,
  contact: { name: string; title: string | null },
  brief?: string | null,
  affiliations?: AffiliationFact[],
): Promise<OutreachDraft> {
  const briefBlock = brief
    ? `\n\nCOMPANY RESEARCH (real facts you may reference for a specific hook; do not invent beyond them):\n${brief.slice(0, 3000)}`
    : "";
  const affiliationBlock = affiliations?.length
    ? `\n\nVERIFIED SHARED AFFILIATIONS with this contact, strongest first — open with the first one:\n${affiliations
        .map((a) => `- [${a.kind}] ${a.detail}`)
        .join("\n")}`
    : "";
  const { data } = await structuredComplete({
    tier: "premium",
    schema: DraftResult,
    schemaName: "outreach_draft",
    maxTokens: 8000,
    system: DRAFT_RULES,
    cache: `CANDIDATE PROFILE:\n\n${profile}`,
    user: `CONTACT: ${contact.name}${contact.title ? ` — ${contact.title}` : ""}${affiliationBlock}\n\nJOB\nTitle: ${job.title}\nCompany: ${job.companyName}\n\nDESCRIPTION:\n${job.description.slice(0, 8000)}${briefBlock}`,
  });
  return data;
}

export async function draftNudge(args: {
  originalSubject: string;
  originalBody: string;
  contactName: string;
  jobTitle: string;
  companyName: string;
  touchNumber?: number;
}): Promise<{ body: string }> {
  const touch = args.touchNumber ?? 2;
  const { data } = await structuredComplete({
    tier: "premium",
    schema: NudgeResult,
    schemaName: "outreach_nudge",
    maxTokens: 4000,
    system: NUDGE_RULES,
    user: `This is TOUCH ${touch} of a maximum 3. The original email below to ${args.contactName} about the ${args.jobTitle} role at ${args.companyName} got no reply. Write the follow-up.\n\nORIGINAL (subject: ${args.originalSubject}):\n${args.originalBody}`,
  });
  return data;
}
