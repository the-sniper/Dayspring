// Next-free research-brief orchestration — actions, MCP, and the tailor/
// outreach injectors all read through here.
import { desc, eq } from "drizzle-orm";
import { generateBrief } from "@/lib/claude/research";
import { db } from "@/lib/db";
import { companies, jobs, researchBriefs } from "@/lib/db/schema";

export type BriefRow = typeof researchBriefs.$inferSelect;

// Latest brief for a company (from either a company brief or a job brief that
// carried this companyId). Used to thread research into tailoring + outreach.
export function latestCompanyBrief(companyId: number): BriefRow | undefined {
  return db
    .select()
    .from(researchBriefs)
    .where(eq(researchBriefs.companyId, companyId))
    .orderBy(desc(researchBriefs.createdAt))
    .get();
}

export function latestJobBrief(jobId: number): BriefRow | undefined {
  return db
    .select()
    .from(researchBriefs)
    .where(eq(researchBriefs.jobId, jobId))
    .orderBy(desc(researchBriefs.createdAt))
    .get();
}

type BriefResult =
  | { ok: true; brief: string; sources: { title: string; url: string }[] }
  | { ok: false; error: string };

export async function briefForCompany(
  companyId: number,
  deep = false,
): Promise<BriefResult> {
  const company = db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();
  if (!company) return { ok: false, error: "Company not found" };

  try {
    const res = await generateBrief({
      subject: `Company: ${company.name}${company.domain ? ` (${company.domain})` : ""}`,
      context:
        "The candidate is deciding whether to apply and how to tailor their application. They want current, specific facts to reference — funding, what the company builds, recent news, and interview intel.",
      deep,
    });
    db.insert(researchBriefs)
      .values({
        companyId,
        kind: "company",
        brief: res.brief,
        sources: res.sources,
        model: res.model,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { ok: true, brief: res.brief, sources: res.sources };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Research failed" };
  }
}

export async function briefForJob(
  jobId: number,
  deep = false,
): Promise<BriefResult> {
  const row = db
    .select({ job: jobs, companyName: companies.name, domain: companies.domain })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .get();
  if (!row) return { ok: false, error: "Job not found" };

  try {
    const res = await generateBrief({
      subject: `Role: ${row.job.title} at ${row.companyName}${row.domain ? ` (${row.domain})` : ""}`,
      context: `The candidate is evaluating this specific role and will tailor their application to it. Job description excerpt:\n${row.job.description.slice(0, 2000)}`,
      deep,
    });
    db.insert(researchBriefs)
      .values({
        jobId,
        companyId: row.job.companyId, // carry company so outreach can reuse
        kind: "job",
        brief: res.brief,
        sources: res.sources,
        model: res.model,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { ok: true, brief: res.brief, sources: res.sources };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Research failed" };
  }
}
