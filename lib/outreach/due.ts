import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, companies, contacts, jobs, outreach } from "@/lib/db/schema";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Sent outreach with no reply whose follow-up date has arrived.
export function outreachDue() {
  return db
    .select({
      id: outreach.id,
      subject: outreach.subject,
      followUpDue: outreach.followUpDue,
      sentAt: outreach.sentAt,
      contactName: contacts.name,
      companyName: companies.name,
      jobId: jobs.id,
      jobTitle: jobs.title,
    })
    .from(outreach)
    .innerJoin(contacts, eq(outreach.contactId, contacts.id))
    .leftJoin(jobs, eq(outreach.jobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(
      and(
        isNotNull(outreach.sentAt),
        isNull(outreach.repliedAt),
        isNotNull(outreach.followUpDue),
        lte(outreach.followUpDue, today()),
      ),
    )
    .orderBy(outreach.followUpDue)
    .all();
}

// Applications that went quiet: applied 10+ days ago, no status movement,
// nothing queued in next actions.
export function staleApplications(days = 10) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return db
    .select({
      jobId: jobs.id,
      title: jobs.title,
      companyName: companies.name,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .leftJoin(applications, eq(applications.jobId, jobs.id))
    .where(
      and(
        eq(jobs.status, "applied"),
        sql`${jobs.updatedAt} < ${cutoff}`,
        isNull(applications.nextAction),
      ),
    )
    .orderBy(jobs.updatedAt)
    .all();
}
