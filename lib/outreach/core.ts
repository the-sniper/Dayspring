// Next-free outreach orchestration — actions, the daily script, and the MCP
// server all call this layer.
//
// Thread model: a first draft is touch 1; each nudge is the next touch,
// linked by parentId. The 3-touch cap and the humanEditedPct floor are
// enforced HERE (not just in the UI) so no client can bypass them.
import { draftNudge, draftOutreach } from "@/lib/claude/outreach";
import { api, convex } from "@/lib/convex/server";
import { getGmailConfig, sendEmail } from "@/lib/integrations/gmail/client";
import { getProfile } from "@/lib/jobs/score";
import { latestCompanyBrief } from "@/lib/research/core";
import {
  channelAlias,
  FOLLOW_UP_GAP_DAYS,
  HUMAN_EDIT_FLOOR_PCT,
  humanEditedPct,
  MAX_TOUCHES,
} from "@/shared/outreach-rules";

function followUpDate(touchJustSent: number): string | undefined {
  const gap = FOLLOW_UP_GAP_DAYS[touchJustSent] ?? null;
  if (gap === null) return undefined;
  return new Date(Date.now() + gap * 86_400_000).toISOString().slice(0, 10);
}

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

export async function createDraft(
  contactId: string,
  jobId: string,
): Promise<Result<{ outreachId: string }>> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "No profile yet — paste your resume in Settings first." };
  const contact = await convex().query(api.contacts.getById, { id: contactId as never });
  if (!contact) return { ok: false, error: "Contact not found" };
  const job = await convex().query(api.jobs.getWithCompany, { id: jobId as never });
  if (!job) return { ok: false, error: "Job not found" };

  const [brief, affiliations] = await Promise.all([
    latestCompanyBrief(job.companyId).then((b) => b?.brief ?? null),
    convex().query(api.affiliations.listByContact, { contactId: contactId as never }),
  ]);

  try {
    const draft = await draftOutreach(
      profile,
      {
        title: job.title,
        companyName: job.companyName,
        location: job.location ?? null,
        description: job.description,
      },
      { name: contact.name, title: contact.title ?? null },
      brief,
      affiliations.map((a) => ({ kind: a.kind, detail: a.detail })),
    );
    const outreachId = await convex().mutation(api.outreach.insert, {
      doc: {
        contactId,
        jobId,
        channel: "email",
        subject: draft.subject,
        draft: draft.body,
        aiDraft: draft.body,
        touchNumber: 1,
        createdAt: new Date().toISOString(),
      },
    });
    return { ok: true, outreachId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Drafting failed" };
  }
}

export async function createNudgeDraft(
  originalId: string,
): Promise<Result<{ outreachId: string }>> {
  const original = await convex().query(api.outreach.getById, { id: originalId as never });
  if (!original?.sentAt) return { ok: false, error: "Original outreach not found or unsent" };
  const priorTouch = original.touchNumber ?? 1;
  if (priorTouch >= MAX_TOUCHES) {
    return {
      ok: false,
      error: `3-touch cap: touches 1–3 produce 93% of replies; touch 4+ adds almost nothing. This thread is done — spend the time on a new contact or a new affiliation.`,
    };
  }
  const contact = await convex().query(api.contacts.getById, { id: original.contactId });
  const job = original.jobId
    ? await convex().query(api.jobs.getWithCompany, { id: original.jobId })
    : null;
  if (!contact) return { ok: false, error: "Contact not found" };

  try {
    const nudge = await draftNudge({
      originalSubject: original.subject ?? "",
      originalBody: original.draft ?? "",
      contactName: contact.name,
      jobTitle: job?.title ?? "the role",
      companyName: job?.companyName ?? "the company",
      touchNumber: priorTouch + 1,
    });
    const outreachId = await convex().mutation(api.outreach.insert, {
      doc: {
        contactId: original.contactId,
        jobId: original.jobId ?? undefined,
        channel: original.channel ?? "email",
        subject: original.subject?.startsWith("Re:")
          ? original.subject
          : `Re: ${original.subject ?? ""}`,
        draft: nudge.body,
        aiDraft: nudge.body,
        touchNumber: priorTouch + 1,
        parentId: originalId,
        // Pre-seed the thread so the send lands as a reply.
        gmailThreadId: original.gmailThreadId ?? undefined,
        createdAt: new Date().toISOString(),
      },
    });
    return { ok: true, outreachId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Nudge drafting failed" };
  }
}

export async function updateDraft(id: string, subject: string, body: string): Promise<Result> {
  const row = await convex().query(api.outreach.getById, { id: id as never });
  if (!row) return { ok: false, error: "Not found" };
  if (row.sentAt) return { ok: false, error: "Already sent — drafts only." };
  await convex().mutation(api.outreach.patch, { id: id as never, patch: { subject, draft: body } });
  return { ok: true };
}

// The floor: below HUMAN_EDIT_FLOOR_PCT the send does not happen. Only
// enforceable when the frozen AI proposal exists (legacy rows are exempt).
function editFloorError(row: { aiDraft?: string | null; draft?: string | null }): string | null {
  if (!row.aiDraft) return null;
  const pct = humanEditedPct(row.aiDraft, row.draft ?? "");
  if (pct >= HUMAN_EDIT_FLOOR_PCT) return null;
  return `Only ${pct}% of this body is yours (floor: ${HUMAN_EDIT_FLOOR_PCT}%). The draft is scaffolding — rewrite it in your own words before it goes out.`;
}

async function markSentInternal(
  id: string,
  opts?: { gmail?: { id: string; threadId: string }; channel?: string },
) {
  const row = await convex().query(api.outreach.getById, { id: id as never });
  if (!row) return;
  const touch = row.touchNumber ?? 1;
  const channel = opts?.channel ?? row.channel ?? "email";

  // Per-channel plus-alias for attribution, derived from the Gmail address.
  let aliasUsed: string | undefined;
  try {
    const config = await getGmailConfig();
    if (config?.email) {
      const contact = await convex().query(api.contacts.getById, { id: row.contactId });
      const company = contact?.companyId
        ? await convex().query(api.companies.getById, { id: contact.companyId })
        : null;
      aliasUsed =
        channelAlias(config.email, channel === "linkedin" ? "ln" : "em", company?.name ?? null) ??
        undefined;
    }
  } catch {
    // Attribution is best-effort; never block a send on it.
  }

  const patch: Record<string, unknown> = {
    sentAt: new Date().toISOString(),
    followUpDue: followUpDate(touch),
    channel,
  };
  if (row.aiDraft) patch.humanEditedPct = humanEditedPct(row.aiDraft, row.draft ?? "");
  if (aliasUsed) patch.aliasUsed = aliasUsed;
  if (opts?.gmail?.id) patch.gmailMessageId = opts.gmail.id;
  if (opts?.gmail?.threadId) patch.gmailThreadId = opts.gmail.threadId;
  await convex().mutation(api.outreach.patch, { id: id as never, patch });
  await convex().mutation(api.contacts.patch, {
    id: row.contactId,
    patch: { outreachStatus: "sent" },
  });
}

export async function sendOutreach(id: string): Promise<Result> {
  const row = await convex().query(api.outreach.getById, { id: id as never });
  if (!row) return { ok: false, error: "Not found" };
  if (row.sentAt) return { ok: false, error: "Already sent." };
  const floorErr = editFloorError(row);
  if (floorErr) return { ok: false, error: floorErr };
  const contact = await convex().query(api.contacts.getById, { id: row.contactId });
  if (!contact?.email) {
    return { ok: false, error: "Contact has no email — reveal one via Apollo first." };
  }
  try {
    const sent = await sendEmail({
      to: contact.email,
      subject: row.subject ?? "",
      body: row.draft ?? "",
      threadId: row.gmailThreadId ?? undefined,
    });
    await markSentInternal(id, { gmail: sent, channel: "email" });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

export async function markSentManually(id: string, channel?: string): Promise<Result> {
  const row = await convex().query(api.outreach.getById, { id: id as never });
  if (!row) return { ok: false, error: "Not found" };
  if (row.sentAt) return { ok: false, error: "Already sent." };
  const floorErr = editFloorError(row);
  if (floorErr) return { ok: false, error: floorErr };
  await markSentInternal(id, { channel });
  return { ok: true };
}

export async function markReplied(id: string): Promise<Result> {
  const row = await convex().query(api.outreach.getById, { id: id as never });
  if (!row) return { ok: false, error: "Not found" };
  await convex().mutation(api.outreach.patch, {
    id: id as never,
    patch: { repliedAt: new Date().toISOString() },
  });
  await convex().mutation(api.contacts.patch, {
    id: row.contactId,
    patch: { outreachStatus: "replied" },
  });
  return { ok: true };
}

export async function deleteDraft(id: string): Promise<Result> {
  const row = await convex().query(api.outreach.getById, { id: id as never });
  if (!row) return { ok: false, error: "Not found" };
  if (row.sentAt) return { ok: false, error: "Sent records are kept — only drafts can be deleted." };
  await convex().mutation(api.outreach.remove, { id: id as never });
  return { ok: true };
}
