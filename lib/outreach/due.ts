import { api, convex } from "@/lib/convex/server";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export type OutreachDueRow = {
  id: string;
  subject: string | null;
  followUpDue: string | null;
  sentAt: string | null;
  contactName: string | null;
  companyName: string | null;
  jobId: string | null;
  jobTitle: string | null;
};

// Sent outreach with no reply whose follow-up date has arrived.
export async function outreachDue(): Promise<OutreachDueRow[]> {
  const rows = await convex().query(api.outreach.queue, {});
  const cutoff = today();
  return rows
    .filter(
      (o) =>
        o.sentAt && !o.repliedAt && o.followUpDue && o.followUpDue <= cutoff,
    )
    .map((o) => ({
      id: o.id,
      subject: o.subject ?? null,
      followUpDue: o.followUpDue ?? null,
      sentAt: o.sentAt ?? null,
      contactName: o.contact?.name ?? null,
      companyName: o.company?.name ?? null,
      jobId: o.job?.id ?? null,
      jobTitle: o.job?.title ?? null,
    }))
    .sort((a, b) => (a.followUpDue ?? "").localeCompare(b.followUpDue ?? ""));
}

export type StaleApplicationRow = {
  jobId: string;
  title: string;
  companyName: string;
  updatedAt: string;
};

// Applications that went quiet: applied 10+ days ago, no status movement,
// nothing queued in next actions.
export async function staleApplications(days = 10): Promise<StaleApplicationRow[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const [jobs, applications] = await Promise.all([
    convex().query(api.jobs.byStatuses, { statuses: ["applied"] }),
    convex().query(api.applications.listAll, {}),
  ]);
  const appByJob = new Map(applications.map((a) => [String(a.jobId), a]));
  return jobs
    .filter((j) => {
      if (j.updatedAt >= cutoff) return false;
      const app = appByJob.get(String(j.id));
      return !app?.nextAction;
    })
    .map((j) => ({
      jobId: j.id,
      title: j.title,
      companyName: j.companyName,
      updatedAt: j.updatedAt,
    }))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}
