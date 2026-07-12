// Next-free research-brief orchestration — actions, MCP, and the tailor/
// outreach injectors all read through here.
import { generateBrief } from "@/lib/claude/research";
import { api, convex } from "@/lib/convex/server";

export type BriefRow = {
  id: string;
  jobId: string | null;
  companyId: string | null;
  kind: string;
  brief: string;
  sources: { title: string; url: string }[] | null;
  model: string | null;
  createdAt: string;
};

// Latest brief for a company (from either a company brief or a job brief that
// carried this companyId). Used to thread research into tailoring + outreach.
export async function latestCompanyBrief(companyId: string): Promise<BriefRow | undefined> {
  const row = await convex().query(api.research.latestForCompany, { companyId: companyId as never });
  return row ? normalize(row) : undefined;
}

export async function latestJobBrief(jobId: string): Promise<BriefRow | undefined> {
  const row = await convex().query(api.research.latestForJob, { jobId: jobId as never });
  return row ? normalize(row) : undefined;
}

function normalize(r: Record<string, unknown> & { id: string }): BriefRow {
  return {
    id: r.id,
    jobId: (r.jobId as string) ?? null,
    companyId: (r.companyId as string) ?? null,
    kind: r.kind as string,
    brief: r.brief as string,
    sources: (r.sources as { title: string; url: string }[]) ?? null,
    model: (r.model as string) ?? null,
    createdAt: r.createdAt as string,
  };
}

type BriefResult =
  | { ok: true; brief: string; sources: { title: string; url: string }[] }
  | { ok: false; error: string };

export async function briefForCompany(
  companyId: string,
  deep = false,
): Promise<BriefResult> {
  const company = await convex().query(api.companies.getById, { id: companyId as never });
  if (!company) return { ok: false, error: "Company not found" };

  try {
    const res = await generateBrief({
      subject: `Company: ${company.name}${company.domain ? ` (${company.domain})` : ""}`,
      context:
        "The candidate is deciding whether to apply and how to tailor their application. They want current, specific facts to reference — funding, what the company builds, recent news, and interview intel.",
      deep,
    });
    await convex().mutation(api.research.insert, {
      doc: {
        companyId,
        kind: "company",
        brief: res.brief,
        sources: res.sources,
        model: res.model,
        createdAt: new Date().toISOString(),
      },
    });
    return { ok: true, brief: res.brief, sources: res.sources };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Research failed" };
  }
}

export async function briefForJob(
  jobId: string,
  deep = false,
): Promise<BriefResult> {
  const job = await convex().query(api.jobs.getWithCompany, { id: jobId as never });
  if (!job) return { ok: false, error: "Job not found" };

  try {
    const res = await generateBrief({
      subject: `Role: ${job.title} at ${job.companyName}${job.companyDomain ? ` (${job.companyDomain})` : ""}`,
      context: `The candidate is evaluating this specific role and will tailor their application to it. Job description excerpt:\n${job.description.slice(0, 2000)}`,
      deep,
    });
    await convex().mutation(api.research.insert, {
      doc: {
        jobId,
        companyId: job.companyId, // carry company so outreach can reuse
        kind: "job",
        brief: res.brief,
        sources: res.sources,
        model: res.model,
        createdAt: new Date().toISOString(),
      },
    });
    return { ok: true, brief: res.brief, sources: res.sources };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Research failed" };
  }
}
