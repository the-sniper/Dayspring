// Morning digest assembly — pure data, no LLM. Shared by scripts/daily.ts
// (emails it) and the MCP server's `digest` tool (returns it).
import { api, convex } from "@/lib/convex/server";
import { outreachDue, staleApplications, today } from "@/lib/outreach/due";
import { KANBAN_STATUSES } from "@/lib/types";

export type RunInfo = {
  added: number;
  scored: number;
  repliesFound: number;
  errors: string[];
};

export async function assembleDigest(run?: RunInfo): Promise<{ subject: string; text: string }> {
  const [highFit, activeJobs, countsRaw, allApps, due, stale] =
    await Promise.all([
      convex().query(api.jobs.topNewByScore, { limit: 8, minScore: 70 }),
      convex().query(api.jobs.byStatuses, { statuses: [...KANBAN_STATUSES] }),
      convex().query(api.jobs.statusCounts, {}),
      convex().query(api.applications.listAll, {}),
      outreachDue(),
      staleApplications(),
    ]);

  const jobById = new Map(activeJobs.map((j) => [String(j.id), j]));
  const cutoff = today();
  const nextActions = allApps
    .filter((a) => a.nextActionDue && a.nextActionDue <= cutoff)
    .map((a) => {
      const job = jobById.get(String(a.jobId));
      return {
        title: job?.title ?? "",
        companyName: job?.companyName ?? "",
        nextAction: a.nextAction ?? null,
        nextActionDue: a.nextActionDue ?? null,
      };
    });

  const counts = new Map<string, number>(Object.entries(countsRaw));

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
