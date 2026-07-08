// Next-free outreach orchestration — actions, the daily script, and the MCP
// server all call this layer.
import { eq } from "drizzle-orm";
import { draftNudge, draftOutreach } from "@/lib/claude/outreach";
import { db } from "@/lib/db";
import { companies, contacts, jobs, outreach } from "@/lib/db/schema";
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
  contactId: number,
  jobId: number,
): Promise<Result<{ outreachId: number }>> {
  const profile = getProfile();
  if (!profile) return { ok: false, error: "No profile yet — paste your resume in Settings first." };
  const contact = db.select().from(contacts).where(eq(contacts.id, contactId)).get();
  if (!contact) return { ok: false, error: "Contact not found" };
  const row = db
    .select({ job: jobs, companyName: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .get();
  if (!row) return { ok: false, error: "Job not found" };

  const brief = latestCompanyBrief(row.job.companyId)?.brief ?? null;

  try {
    const draft = await draftOutreach(
      profile,
      {
        title: row.job.title,
        companyName: row.companyName,
        location: row.job.location,
        description: row.job.description,
      },
      { name: contact.name, title: contact.title },
      brief,
    );
    const res = db
      .insert(outreach)
      .values({
        contactId,
        jobId,
        channel: "email",
        subject: draft.subject,
        draft: draft.body,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { ok: true, outreachId: Number(res.lastInsertRowid) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Drafting failed" };
  }
}

export async function createNudgeDraft(
  originalId: number,
): Promise<Result<{ outreachId: number }>> {
  const original = db.select().from(outreach).where(eq(outreach.id, originalId)).get();
  if (!original?.sentAt) return { ok: false, error: "Original outreach not found or unsent" };
  const contact = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, original.contactId))
    .get();
  const row = original.jobId
    ? db
        .select({ title: jobs.title, companyName: companies.name })
        .from(jobs)
        .innerJoin(companies, eq(jobs.companyId, companies.id))
        .where(eq(jobs.id, original.jobId))
        .get()
    : null;
  if (!contact) return { ok: false, error: "Contact not found" };

  try {
    const nudge = await draftNudge({
      originalSubject: original.subject ?? "",
      originalBody: original.draft ?? "",
      contactName: contact.name,
      jobTitle: row?.title ?? "the role",
      companyName: row?.companyName ?? "the company",
    });
    const res = db
      .insert(outreach)
      .values({
        contactId: original.contactId,
        jobId: original.jobId,
        channel: "email",
        subject: original.subject?.startsWith("Re:")
          ? original.subject
          : `Re: ${original.subject ?? ""}`,
        draft: nudge.body,
        // Pre-seed the thread so the send lands as a reply.
        gmailThreadId: original.gmailThreadId,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { ok: true, outreachId: Number(res.lastInsertRowid) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Nudge drafting failed" };
  }
}

export function updateDraft(id: number, subject: string, body: string): Result {
  const row = db.select().from(outreach).where(eq(outreach.id, id)).get();
  if (!row) return { ok: false, error: "Not found" };
  if (row.sentAt) return { ok: false, error: "Already sent — drafts only." };
  db.update(outreach).set({ subject, draft: body }).where(eq(outreach.id, id)).run();
  return { ok: true };
}

function markSentInternal(id: number, gmail?: { id: string; threadId: string }) {
  const now = new Date().toISOString();
  const row = db.select().from(outreach).where(eq(outreach.id, id)).get();
  if (!row) return;
  db.update(outreach)
    .set({
      sentAt: now,
      followUpDue: followUpDate(),
      gmailMessageId: gmail?.id ?? row.gmailMessageId,
      gmailThreadId: gmail?.threadId ?? row.gmailThreadId,
    })
    .where(eq(outreach.id, id))
    .run();
  db.update(contacts)
    .set({ outreachStatus: "sent" })
    .where(eq(contacts.id, row.contactId))
    .run();
}

export async function sendOutreach(id: number): Promise<Result> {
  const row = db.select().from(outreach).where(eq(outreach.id, id)).get();
  if (!row) return { ok: false, error: "Not found" };
  if (row.sentAt) return { ok: false, error: "Already sent." };
  const contact = db.select().from(contacts).where(eq(contacts.id, row.contactId)).get();
  if (!contact?.email) {
    return { ok: false, error: "Contact has no email — reveal one via Apollo first." };
  }
  try {
    const sent = await sendEmail({
      to: contact.email,
      subject: row.subject ?? "",
      body: row.draft ?? "",
      threadId: row.gmailThreadId,
    });
    markSentInternal(id, sent);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

export function markSentManually(id: number): Result {
  const row = db.select().from(outreach).where(eq(outreach.id, id)).get();
  if (!row) return { ok: false, error: "Not found" };
  if (row.sentAt) return { ok: false, error: "Already sent." };
  markSentInternal(id);
  return { ok: true };
}

export function markReplied(id: number): Result {
  const row = db.select().from(outreach).where(eq(outreach.id, id)).get();
  if (!row) return { ok: false, error: "Not found" };
  db.update(outreach)
    .set({ repliedAt: new Date().toISOString(), followUpDue: null })
    .where(eq(outreach.id, id))
    .run();
  db.update(contacts)
    .set({ outreachStatus: "replied" })
    .where(eq(contacts.id, row.contactId))
    .run();
  return { ok: true };
}

export function deleteDraft(id: number): Result {
  const row = db.select().from(outreach).where(eq(outreach.id, id)).get();
  if (!row) return { ok: false, error: "Not found" };
  if (row.sentAt) return { ok: false, error: "Sent records are kept — only drafts can be deleted." };
  db.delete(outreach).where(eq(outreach.id, id)).run();
  return { ok: true };
}
