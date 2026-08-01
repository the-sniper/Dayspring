import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";
import type { AffiliationFact } from "@/lib/claude/outreach";
import type { ReachChannel, ReachContactRole } from "@/shared/reach";

const ChannelDraft = z.object({
  subject: z.string().nullable(),
  body: z.string(),
});

const ReachDrafts = z.object({
  cold_dm: ChannelDraft,
  warm_dm: ChannelDraft,
  email: ChannelDraft,
  linkedin: ChannelDraft,
  personAngle: z.string(),
});

export type ReachMessageSet = {
  channels: Record<ReachChannel, { subject: string | null; body: string }>;
  personAngle: string;
};

const SYSTEM = `You write scaffolding outreach for one candidate contacting one person about one job. The user will edit before sending — your job is structure, research recall, and removing the blank page.

HARD RULES for every channel:
- Never fabricate. Candidate facts only from the profile; company/job facts only from the description and research; person facts only from the contact block and any verified affiliations.
- No invented mutuals, no pretended familiarity, no stock phrases ("I'm a big fan of what you're building", "I came across your profile", "I'd love to pick your brain").
- Greet by first name.
- Sign with the candidate's name if the profile states one; otherwise "[Your name]".
- Plain text. No markdown bullets.

CHANNEL SPECS — write all four:

1) cold_dm — LinkedIn CONNECTION NOTE for a stranger.
   - subject: null
   - body: ≤300 characters total (LinkedIn hard limit). One specific hook + who you are + soft ask. No links if avoidable.

2) warm_dm — LinkedIn DM to someone with a warm path (saved connection, shared affiliation, or prior context).
   - subject: null
   - body: 40–90 words. Lead with the warm hook. Specific, human, easy ask.

3) email — full cold/warm email depending on warmth.
   - subject: 5–6 words, specific, lowercase-casual ok, never clickbait
   - body: 120–180 words, four short parts: hook → relevant proof → company-specific why → easy ask tailored to their role (recruiter vs hiring manager vs teammate).

4) linkedin — longer LinkedIn message / InMail (already connected or InMail).
   - subject: null (or a short InMail subject ≤6 words if helpful)
   - body: 50–140 words. Tighter than email; still specific.

Also return personAngle: one sentence on why THIS person is the right contact for THIS role (role-aware).`;

export async function draftReachMessages(args: {
  profile: string;
  job: {
    title: string;
    companyName: string;
    location: string | null;
    description: string;
  };
  contact: {
    name: string;
    title: string | null;
    role: ReachContactRole;
    warmth: "cold" | "warm";
    notes: string | null;
  };
  brief?: string | null;
  affiliations?: AffiliationFact[];
}): Promise<ReachMessageSet> {
  const briefBlock = args.brief
    ? `\n\nCOMPANY / JOB RESEARCH (only cite these facts):\n${args.brief.slice(0, 2500)}`
    : "";
  const affiliationBlock = args.affiliations?.length
    ? `\n\nVERIFIED WARM HOOKS (use in warm_dm / email when present):\n${args.affiliations
        .map((a) => `- [${a.kind}] ${a.detail}`)
        .join("\n")}`
    : "";

  const { data } = await structuredComplete({
    tier: "premium",
    schema: ReachDrafts,
    schemaName: "reach_messages",
    maxTokens: 8000,
    system: SYSTEM,
    cache: `CANDIDATE PROFILE:\n\n${args.profile}`,
    user: `CONTACT
Name: ${args.contact.name}
Title: ${args.contact.title ?? "(unknown)"}
Role on hiring team: ${args.contact.role}
Warmth: ${args.contact.warmth}${args.contact.notes ? `\nNotes: ${args.contact.notes}` : ""}${affiliationBlock}

JOB
Title: ${args.job.title}
Company: ${args.job.companyName}
Location: ${args.job.location ?? "n/a"}

DESCRIPTION:
${args.job.description.slice(0, 7000)}${briefBlock}`,
  });

  return {
    personAngle: data.personAngle.trim(),
    channels: {
      cold_dm: {
        subject: null,
        body: clampChars(data.cold_dm.body.trim(), 300),
      },
      warm_dm: { subject: null, body: data.warm_dm.body.trim() },
      email: {
        subject: data.email.subject?.trim() || null,
        body: data.email.body.trim(),
      },
      linkedin: {
        subject: data.linkedin.subject?.trim() || null,
        body: data.linkedin.body.trim(),
      },
    },
  };
}

function clampChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
