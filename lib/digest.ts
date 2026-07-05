// Morning digest assembly — pure data, no LLM. Shared by scripts/daily.ts
// (emails it) and the MCP server's `digest` tool (returns it).
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, companies, jobs } from "@/lib/db/schema";
import { outreachDue, staleApplications, today } from "@/lib/outreach/due";
import { KANBAN_STATUSES } from "@/lib/types";

export type RunInfo = {
  added: number;
  scored: number;
  repliesFound: number;
  errors: string[];
};

export function assembleDigest(run?: RunInfo): { subject: string; text: string } {
  const highFit = db
    .select({
      id: jobs.id,
      title: jobs.title,
      matchScore: jobs.matchScore,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(eq(jobs.status, "new"), gte(jobs.matchScore, 70)))
    .orderBy(desc(jobs.matchScore))
    .limit(8)
    .all();

  const due = outreachDue();
  const stale = staleApplications();

  const nextActions = db
    .select({
      title: jobs.title,
      companyName: companies.name,
      nextAction: applications.nextAction,
      nextActionDue: applications.nextActionDue,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(
      and(isNotNull(applications.nextActionDue), lte(applications.nextActionDue, today())),
    )
    .all();

  const counts = new Map<string, number>();
  for (const row of db.select({ status: jobs.status }).from(jobs).all()) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }

  const lines: string[] = [];
  const decisions = highFit.length + due.length + nextActions.length;
  lines.push(`DAYSPRING — ${today()}`);
  lines.push("");

  if (run) {
    lines.push(
      `Overnight: +${run.added} new roles pulled, ${run.scored} scored` +
        (run.repliesFound ? `, ${run.repliesFound} replies detected 🎉` : "") +
        ".",
    );
    for (const e of run.errors) lines.push(`  ⚠ ${e}`);
    lines.push("");
  }

  lines.push(`NEEDS A DECISION (${decisions} items, ~10 minutes)`);
  lines.push("");

  if (highFit.length) {
    lines.push(`High-fit new roles (${highFit.length}):`);
    for (const j of highFit) {
      lines.push(`  [${j.matchScore}] ${j.title} — ${j.companyName}  http://localhost:3000/jobs/${j.id}`);
    }
    lines.push("");
  }
  if (due.length) {
    lines.push(`Follow-ups due (${due.length}):`);
    for (const o of due) {
      lines.push(
        `  ${o.contactName}${o.companyName ? ` at ${o.companyName}` : ""} — no reply since ${o.sentAt?.slice(0, 10)}  http://localhost:3000/outreach`,
      );
    }
    lines.push("");
  }
  if (nextActions.length) {
    lines.push(`Next actions due (${nextActions.length}):`);
    for (const a of nextActions) {
      lines.push(`  ${a.nextActionDue}: ${a.nextAction ?? "follow up"} — ${a.companyName}`);
    }
    lines.push("");
  }
  if (stale.length) {
    lines.push(`Gone quiet (${stale.length} applications, 10+ days):`);
    for (const s of stale) lines.push(`  ${s.title} — ${s.companyName}`);
    lines.push("");
  }
  if (!decisions && !stale.length) {
    lines.push("Nothing waiting on you. Go study. 🌅");
    lines.push("");
  }

  lines.push(
    "Funnel: " +
      KANBAN_STATUSES.map((s) => `${s} ${counts.get(s) ?? 0}`).join(" · ") +
      ` · new ${counts.get("new") ?? 0}`,
  );
  lines.push("");
  lines.push("Open Dayspring: http://localhost:3000");

  return {
    subject: `Dayspring ${today()} — ${decisions} decision${decisions === 1 ? "" : "s"} waiting`,
    text: lines.join("\n"),
  };
}
