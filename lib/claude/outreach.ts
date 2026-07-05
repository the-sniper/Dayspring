import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, MODEL_PREMIUM } from "@/lib/claude/client";
import type { JobForScoring } from "@/lib/claude/score";

const DraftResult = z.object({ subject: z.string(), body: z.string() });
const NudgeResult = z.object({ body: z.string() });

const DRAFT_RULES = `You write warm, specific outreach for one candidate reaching out about one job. The reader is busy; the email must feel person-to-person, not campaign.

HARD RULES:
- Never fabricate. Everything about the candidate comes from the profile text; everything about the company/role comes from the job description. No invented mutual connections, no pretended familiarity.
- Under 130 words. Plain text. No bullet points.
- Greet by first name.
- One SPECIFIC hook: something concrete from this job description or what the role owns — not "I'm impressed by your company".
- One line on who the candidate is, drawn from the profile (their strongest relevant fact).
- One small, easy ask: a referral, or 15 minutes, or "who's the right person to talk to" — pick what fits the contact's role (recruiter vs engineer vs manager).
- Sign with the candidate's name if the profile states one; otherwise sign exactly "[Your name]".
- subject: ≤ 8 words, specific, lowercase-casual is fine, never clickbait.`;

const NUDGE_RULES = `You write a follow-up bump for an email that got no reply. 2–3 sentences, under 50 words. Warm, zero guilt-tripping, restate the small ask in fresh words, give an easy out ("if now's not a good time, no worries"). Plain text. Sign-off consistent with the original. Never fabricate anything.`;

export type OutreachDraft = { subject: string; body: string };

export async function draftOutreach(
  profile: string,
  job: JobForScoring,
  contact: { name: string; title: string | null },
): Promise<OutreachDraft> {
  const response = await getClient().messages.parse({
    model: MODEL_PREMIUM,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: DRAFT_RULES },
      {
        type: "text",
        text: `CANDIDATE PROFILE:\n\n${profile}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `CONTACT: ${contact.name}${contact.title ? ` — ${contact.title}` : ""}\n\nJOB\nTitle: ${job.title}\nCompany: ${job.companyName}\n\nDESCRIPTION:\n${job.description.slice(0, 8000)}`,
      },
    ],
    output_config: { format: zodOutputFormat(DraftResult) },
  });
  if (!response.parsed_output) {
    throw new Error(`Outreach drafting failed (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

export async function draftNudge(args: {
  originalSubject: string;
  originalBody: string;
  contactName: string;
  jobTitle: string;
  companyName: string;
}): Promise<{ body: string }> {
  const response = await getClient().messages.parse({
    model: MODEL_PREMIUM,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: NUDGE_RULES,
    messages: [
      {
        role: "user",
        content: `The original email below to ${args.contactName} about the ${args.jobTitle} role at ${args.companyName} got no reply. Write the bump.\n\nORIGINAL (subject: ${args.originalSubject}):\n${args.originalBody}`,
      },
    ],
    output_config: { format: zodOutputFormat(NudgeResult) },
  });
  if (!response.parsed_output) {
    throw new Error(`Nudge drafting failed (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
