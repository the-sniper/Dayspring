import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";
import { ROLE_TYPES } from "@/shared/role-types";

const NamedContact = z.object({
  name: z.string(),
  title: z.string().nullable(),
  roleHint: z
    .enum([
      "recruiter",
      "hiring_manager",
      "teammate",
      "point_of_contact",
      "other",
    ])
    .nullable(),
});

const ParsedJob = z.object({
  title: z.string(),
  companyName: z.string(),
  companyDomain: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string(),
  roleType: z.enum(ROLE_TYPES).nullable(),
  namedContacts: z.array(NamedContact),
});

export type ParsedJobFromUrl = z.infer<typeof ParsedJob>;

const SYSTEM = `You extract a single job posting from page text or a pasted description.

Rules:
- Only use facts present in the text. Never invent companies, titles, domains, or people.
- companyDomain: public website hostname only (e.g. "stripe.com"), no protocol/path. Omit if unknown. Prefer the employer's domain over the job-board host (boards.greenhouse.io, jobs.lever.co, linkedin.com, etc.).
- description: clean plain-text job description, keep requirements and team context; drop nav/cookie chrome.
- roleType: only when the title/description makes it obvious — FS/FE/BE/FDE/MOBILE/DATA/AIML/INFRA/SEC/QA/EMB/XR/GAME/PM/DESIGN.
- namedContacts: people explicitly named as hiring contacts, recruiters, or "reach out to X" in the posting. Empty array if none. Never invent names.
- If the text is not a job posting, still return best-effort fields you can verify; use empty description only if truly nothing is there.`;

export async function parseJobFromText(args: {
  text: string;
  sourceUrl?: string | null;
  pageTitle?: string | null;
}): Promise<ParsedJobFromUrl> {
  const meta = [
    args.sourceUrl ? `SOURCE URL: ${args.sourceUrl}` : null,
    args.pageTitle ? `PAGE TITLE: ${args.pageTitle}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { data } = await structuredComplete({
    tier: "cheap",
    schema: ParsedJob,
    schemaName: "parse_job_url",
    maxTokens: 8000,
    system: SYSTEM,
    user: `${meta ? `${meta}\n\n` : ""}PAGE / DESCRIPTION TEXT:\n\n${args.text.slice(0, 20_000)}`,
  });

  return {
    ...data,
    title: data.title.trim(),
    companyName: data.companyName.trim(),
    companyDomain: cleanDomain(data.companyDomain),
    description: data.description.trim(),
    namedContacts: data.namedContacts
      .map((c) => ({
        ...c,
        name: c.name.trim(),
        title: c.title?.trim() || null,
      }))
      .filter((c) => c.name.length > 1),
  };
}

function cleanDomain(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? d;
  if (!d.includes(".") || d.includes(" ")) return null;
  // Job-board hosts are not employer domains.
  if (
    /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|linkedin\.com|indeed\.com|glassdoor\.com|jobs\.|boards\.)/i.test(
      d,
    )
  ) {
    return null;
  }
  return d;
}
