// Next-free outreach orchestration — actions, the daily script, and the MCP
// server all call this layer.
import { draftNudge, draftOutreach } from "@/lib/claude/outreach";
import { api, convex } from "@/lib/convex/server";
import { sendEmail } from "@/lib/integrations/gmail/client";
import { getProfile } from "@/lib/jobs/score";
import { latestCompanyBrief } from "@/lib/research/core";

export const FOLLOW_UP_DAYS = 5;

function followUpDate(): string {
  return new Date(Date.now() + FOLLOW_UP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
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

  const brief = (await latestCompanyBrief(job.companyId))?.brief ?? null;

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
    );
    const outreachId = await convex().mutation(api.outreach.insert, {
      doc: {
        contactId,
        jobId,
        channel: "email",
        subject: draft.subject,
        draft: draft.body,
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
    });
    const outreachId = await convex().mutation(api.outreach.insert, {
      doc: {
        contactId: original.contactId,
        jobId: original.jobId ?? undefined,
        channel: "email",
        subject: original.subject?.startsWith("Re:")
          ? original.subject
          : `Re: ${original.subject ?? ""}`,
        draft: nudge.body,
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

async function markSentInternal(id: string, gmail?: { id: string; threadId: string }) {
  const row = await convex().query(api.outreach.getById, { id: id as never });
  if (!row) return;
  const patch: Record<string, unknown> = { sentAt: new Date().toISOString(), followUpDue: followUpDate() };
  if (gmail?.id) patch.gmailMessageId = gmail.id;
  if (gmail?.threadId) patch.gmailThreadId = gmail.threadId;
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
    await markSentInternal(id, sent);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

export async function markSentManually(id: string): Promise<Result> {
  const row = await convex().query(api.outreach.getById, { id: id as never });
  if (!row) return { ok: false, error: "Not found" };
  if (row.sentAt) return { ok: false, error: "Already sent." };
  await markSentInternal(id);
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
