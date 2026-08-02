// The email-apply lane.
//
// This is the ONE path where a machine can legitimately complete an application
// end to end. There is no candidate-side submit API at any ATS (Greenhouse,
// SmartRecruiters and Ashby all gate their submit endpoints behind the
// EMPLOYER's key), so form-based applications will always need a browser with a
// human on the trigger. A posting that says "email us at jobs@…" is different:
// sending mail is what a mail client is for, no terms are being worked around,
// and there is no CAPTCHA to launder.
//
// The same discipline as outreach still applies. The AI draft is scaffolding,
// not the artifact — sendApplicationEmail refuses to send until enough of the
// body is the user's own words (HUMAN_EDIT_FLOOR_PCT). A fully machine-written
// application is exactly the low-signal thing Dayspring's positioning argues
// against, and this lane makes it cheap enough to be a real temptation.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadApplyContext, setApplyStatus, appendApplyLog } from "@/lib/apply/core";
import { api, convex } from "@/lib/convex/server";
import type { Attachment } from "@/lib/integrations/gmail/client";
import { setJobStatusCore } from "@/lib/jobs/transition";
import { HUMAN_EDIT_FLOOR_PCT, humanEditedPct } from "@/shared/outreach-rules";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// Addresses that are never an application target, even when they appear in a
// job description. Sending a résumé to a press or privacy alias is worse than
// not applying.
const NON_APPLY_RX =
  /^(press|media|privacy|legal|security|abuse|support|help|sales|billing|info|noreply|no-reply|donotreply|marketing|newsletter|webmaster|postmaster)@/i;

// Ordered by how strongly the address signals "send applications here".
const APPLY_LOCALPARTS = [
  "jobs",
  "careers",
  "hiring",
  "recruiting",
  "recruitment",
  "apply",
  "talent",
  "work",
  "join",
];

const EMAIL_RX = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

// Pull the best application address out of a job description. Returns null when
// there isn't a credible one, which is the common case — most postings are
// form-based and belong in the browser lane.
export function extractApplyEmail(text: string | null | undefined): string | null {
  if (!text) return null;
  // mailto: links are an explicit instruction and beat any bare address.
  const mailto = text.match(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  const candidates: string[] = [];
  if (mailto?.[1]) candidates.push(mailto[1]);
  candidates.push(...(text.match(EMAIL_RX) ?? []));

  const seen = new Set<string>();
  const clean = candidates
    .map((e) => e.toLowerCase().trim())
    .filter((e) => {
      if (seen.has(e) || NON_APPLY_RX.test(e)) return false;
      seen.add(e);
      return true;
    });
  if (clean.length === 0) return null;

  // An explicit mailto: that survived filtering wins outright.
  if (mailto?.[1] && clean.includes(mailto[1].toLowerCase())) return mailto[1].toLowerCase();
  for (const local of APPLY_LOCALPARTS) {
    const hit = clean.find((e) => e.split("@")[0] === local || e.startsWith(`${local}+`));
    if (hit) return hit;
  }
  // A bare personal address in a JD is usually a hiring manager, but it is also
  // often a random mention. Only accept one when the surrounding text asks for
  // an application.
  if (/send (?:your |a )?(?:resume|cv|application)|apply (?:by|via) e-?mail|e-?mail (?:us|your)/i.test(text)) {
    return clean[0];
  }
  return null;
}

export type ApplicationEmailDraft = {
  to: string;
  subject: string;
  body: string;
  resumePath: string | null;
  resumeSource: "tailored" | "master" | "settings" | null;
};

const Draft = z.object({
  subject: z.string(),
  body: z.string(),
});

// Compose the application email. Returns a DRAFT — nothing is sent here, and
// the body that comes back is expected to be rewritten before it goes out.
export async function draftApplicationEmail(
  jobId: string,
  opts: { to?: string; masterResumeId?: string | null } = {},
): Promise<Result<{ draft: ApplicationEmailDraft }>> {
  const loaded = await loadApplyContext(jobId, { masterResumeId: opts.masterResumeId });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { ctx } = loaded;

  // The address lives in the posting text, which ApplyContext doesn't carry.
  const job = await convex().query(api.jobs.getWithCompany, { id: jobId as never });
  const to = opts.to ?? extractApplyEmail(job?.description) ?? null;
  if (!to) {
    return {
      ok: false,
      error:
        "No application email for this job — pass one explicitly, or use the browser lane if it's a form.",
    };
  }

  const { hasApiKey } = await import("@/lib/claude/client");
  if (!(await hasApiKey())) return { ok: false, error: "No Anthropic API key set." };
  const { getProfile } = await import("@/lib/jobs/score");
  const profile = ((await getProfile()) ?? "").slice(0, 6000);
  const { structuredComplete } = await import("@/lib/ai/complete");

  const { data } = await structuredComplete({
    tier: "standard",
    schema: Draft,
    schemaName: "application_email",
    maxTokens: 1200,
    system: `You draft a short application email that a candidate will rewrite before sending.
Rules (strict):
- Use ONLY facts stated in the applicant material below. Never invent employers, dates, titles, metrics, or claims.
- 120-180 words in the body. No preamble, no "I hope this finds you well".
- Say what the applicant has actually done that bears on THIS role, and be specific about it.
- Plain text. No markdown, no bullet characters, no signature block beyond a name line.
- Subject line: role title plus the applicant's name. Nothing clever.
- Mention that a résumé is attached, once, at the end.`,
    cache: `Applicant profile:\n${profile}`,
    user: [
      `Role: ${ctx.job.title} at ${ctx.job.companyName}`,
      `Applicant name: ${ctx.fields.fullName ?? "(unknown)"}`,
      ctx.briefSummary ? `Research brief on the company:\n${ctx.briefSummary}` : "",
      ctx.job.tailoredBullets?.length
        ? `Strongest talking points for this role:\n- ${ctx.job.tailoredBullets.join("\n- ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  return {
    ok: true,
    draft: {
      to,
      subject: data.subject.trim(),
      body: data.body.trim(),
      resumePath: ctx.resumePath,
      resumeSource: ctx.resumeSource,
    },
  };
}

// Send it. aiDraft is the frozen proposal from draftApplicationEmail; body is
// what the human actually wants to send. The gap between them is the gate.
export async function sendApplicationEmail(
  jobId: string,
  args: {
    to: string;
    subject: string;
    body: string;
    aiDraft?: string | null;
    resumePath?: string | null;
  },
): Promise<Result<{ gmailId: string; threadId: string }>> {
  const { hasGmail, sendEmail } = await import("@/lib/integrations/gmail/client");
  if (!(await hasGmail())) return { ok: false, error: "Gmail isn't connected." };
  if (!args.to.trim()) return { ok: false, error: "No recipient." };
  if (!args.body.trim()) return { ok: false, error: "Empty body." };

  // Same floor as outreach: the draft is scaffolding, not the artifact.
  if (args.aiDraft) {
    const pct = humanEditedPct(args.aiDraft, args.body);
    if (pct < HUMAN_EDIT_FLOOR_PCT) {
      return {
        ok: false,
        error: `Only ${pct}% of this email is yours (floor: ${HUMAN_EDIT_FLOOR_PCT}%). Rewrite it in your own words before it goes to a real hiring inbox.`,
      };
    }
  }

  const attachments: Attachment[] = [];
  if (args.resumePath) {
    if (!fs.existsSync(args.resumePath)) {
      return { ok: false, error: `Résumé PDF not found at ${args.resumePath}.` };
    }
    attachments.push({
      filename: path.basename(args.resumePath),
      contentType: "application/pdf",
      content: await fs.promises.readFile(args.resumePath),
    });
  }

  try {
    const sent = await sendEmail({
      to: args.to,
      subject: args.subject,
      body: args.body,
      attachments,
    });
    // This lane really did submit an application, so the pipeline says so.
    await setJobStatusCore(jobId, "applied");
    await setApplyStatus(jobId, "submitted", `emailed application to ${args.to}`);
    await appendApplyLog(
      jobId,
      `email-apply → ${args.to}${attachments.length ? " (résumé attached)" : " (NO résumé attached)"}`,
    );
    return { ok: true, gmailId: sent.id, threadId: sent.threadId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}
