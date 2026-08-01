"use server";

import { revalidatePath } from "next/cache";
import { draftReachMessages } from "@/lib/claude/reach-messages";
import { parseJobFromText } from "@/lib/claude/parse-job-url";
import { hasApiKey } from "@/lib/claude/client";
import { api, cleanDoc, convex } from "@/lib/convex/server";
import { listContacts } from "@/lib/contacts/query";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import { resolveOrganizationDomain } from "@/lib/integrations/apollo/organizations";
import {
  searchPeopleFlexible,
  type ApolloPerson,
} from "@/lib/integrations/apollo/search";
import { getProfile } from "@/lib/jobs/score";
import { createJobCore } from "@/lib/jobs/create";
import { extractCandidateDomains } from "@/lib/reach/extract-domains";
import { fetchJobPage } from "@/lib/reach/fetch-job";
import {
  classifyRole,
  findHiringTeam,
  titlesForHiringTeam,
  type HiringTeamMember,
} from "@/lib/reach/hiring-team";
import { keyMessages } from "@/lib/keys/messages";
import { cleanEmployerDomain } from "@/shared/job-boards";
import type { ReachChannel, ReachContactRole } from "@/shared/reach";
import type { RoleType } from "@/shared/role-types";

export type ReachDraftMessages = Record<
  ReachChannel,
  { subject: string | null; body: string }
>;

export type ReachContactResult = {
  apolloId: string | null;
  name: string;
  title: string | null;
  company: string | null;
  location: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  role: ReachContactRole;
  warmth: "cold" | "warm";
  warmReason: string | null;
  source: "apollo" | "job_posting";
  savedContactId: string | null;
  /** Populated only after "Write message with AI". */
  personAngle: string | null;
  messages: ReachDraftMessages | null;
  affiliations: { kind: string; detail: string }[];
};

export type ReachAnalyzeResult =
  | {
      ok: true;
      job: {
        title: string;
        companyName: string;
        companyDomain: string | null;
        location: string | null;
        description: string;
        url: string | null;
        roleType: RoleType | null;
        companyId: string | null;
        jobId: string | null;
      };
      searchTitles: string[];
      contacts: ReachContactResult[];
      warnings: string[];
    }
  | { ok: false; error: string };

export async function analyzeJobReachAction(input: {
  url?: string;
  pastedDescription?: string;
  saveJob?: boolean;
  maxContacts?: number;
}): Promise<ReachAnalyzeResult> {
  const url = input.url?.trim() || "";
  const pasted = input.pastedDescription?.trim() || "";
  if (!url && !pasted) {
    return { ok: false, error: "Paste a job link or the job description." };
  }
  if (!(await hasApiKey())) {
    return { ok: false, error: keyMessages.drafting };
  }
  if (!(await hasApolloKey())) {
    return { ok: false, error: keyMessages.reach };
  }

  const profile = await getProfile();
  if (!profile) {
    return {
      ok: false,
      error: "No profile yet — paste your resume in Settings first.",
    };
  }

  const warnings: string[] = [];
  let sourceUrl: string | null = url || null;
  let pageTitle: string | null = null;
  let text = pasted;

  if (url) {
    try {
      const page = await fetchJobPage(url);
      sourceUrl = page.url;
      pageTitle = page.title;
      // Prefer fetched page; append paste as extra context if provided.
      text = pasted
        ? `${page.text}\n\n--- USER-PASTED DESCRIPTION ---\n\n${pasted}`
        : page.text;
      if (page.truncated) {
        warnings.push("Page was long — used the first portion for parsing.");
      }
    } catch (err) {
      if (!pasted) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not fetch that link.",
        };
      }
      warnings.push(
        err instanceof Error
          ? `${err.message} Using your pasted description instead.`
          : "Fetch failed — using pasted description.",
      );
    }
  }

  let parsed;
  try {
    parsed = await parseJobFromText({
      text,
      sourceUrl,
      pageTitle,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not parse that job.",
    };
  }

  if (!parsed.title || !parsed.companyName) {
    return {
      ok: false,
      error: "Couldn't find a job title and company in that content.",
    };
  }
  if (parsed.description.length < 40) {
    warnings.push(
      "Job description looks thin — drafts may be generic. Paste the full JD for better messages.",
    );
  }

  // Persist company (and optionally the job) so Save Contact can attach.
  const companyId = await convex().mutation(api.companies.findOrCreate, {
    name: parsed.companyName,
  });
  const existingCompany = await convex().query(api.companies.getById, {
    id: companyId as never,
  });

  // Resolve employer domain automatically — never ask the user to type it.
  // Never trust the job-board host (algora.io, greenhouse.io, …). Prefer
  // Apollo org lookup by company name over weak page heuristics.
  const savedDomain = cleanEmployerDomain(existingCompany?.domain ?? null);
  let domain =
    cleanEmployerDomain(parsed.companyDomain) ?? savedDomain ?? null;

  if (!domain) {
    const fromPage = extractCandidateDomains(text, sourceUrl);
    domain = fromPage[0] ?? null;
  }

  // Apollo org search is the reliable path for name → real employer domain.
  // Always try it when we still lack a domain, or when the only domain we
  // have came from a previous bad save (already cleaned above).
  if (!domain) {
    try {
      const resolved = await resolveOrganizationDomain(parsed.companyName);
      if (resolved) domain = resolved.domain;
    } catch (err) {
      warnings.push(
        err instanceof Error
          ? `Company lookup issue: ${err.message}`
          : "Company lookup failed.",
      );
    }
  }

  // Persist / repair domain on the company row. Clear stale job-board hosts
  // (e.g. a previous run that saved algora.io as the employer).
  if (domain && domain !== existingCompany?.domain) {
    await convex().mutation(api.companies.update, {
      id: companyId as never,
      patch: { domain },
    });
  } else if (
    existingCompany?.domain &&
    !cleanEmployerDomain(existingCompany.domain)
  ) {
    await convex().mutation(api.companies.update, {
      id: companyId as never,
      patch: { domain: null },
    });
  }

  let jobId: string | null = null;
  if (input.saveJob !== false) {
    const created = await createJobCore({
      companyName: parsed.companyName,
      title: parsed.title,
      url: sourceUrl,
      location: parsed.location,
      roleType: parsed.roleType,
      description: parsed.description,
      source: "manual",
      status: "wishlist",
    });
    jobId = created.jobId;
    if (!created.inserted && jobId) {
      warnings.push("Job already in your pipeline — reused it.");
    }
  }

  const { titles, roleType } = titlesForHiringTeam(
    parsed.roleType,
    parsed.title,
  );

  const maxContacts = Math.min(Math.max(input.maxContacts ?? 6, 1), 8);
  let team: HiringTeamMember[] = [];

  try {
    team = await findHiringTeam({
      domain,
      organizationName: parsed.companyName,
      titles,
      limit: maxContacts,
    });
  } catch (err) {
    warnings.push(
      err instanceof Error
        ? `Apollo search issue: ${err.message}`
        : "Apollo search failed.",
    );
  }

  // Resolve people named in the JD (often the best POCs).
  if (parsed.namedContacts.length) {
    for (const named of parsed.namedContacts.slice(0, 3)) {
      if (team.length >= maxContacts) break;
      if (team.some((t) => namesMatch(t.name, named.name))) {
        const hit = team.find((t) => namesMatch(t.name, named.name));
        if (hit) {
          hit.role = named.roleHint ?? "point_of_contact";
          hit.source = "job_posting";
        }
        continue;
      }
      try {
        const res = await searchPeopleFlexible({
          titles: named.title ? [named.title] : [],
          locations: [],
          keywords: `${named.name} ${parsed.companyName}`,
          page: 1,
        });
        const match =
          res.people.find((p) => namesMatch(p.name, named.name)) ??
          res.people[0];
        if (match && !team.some((t) => t.apolloId === match.apolloId)) {
          team.unshift({
            ...match,
            role: named.roleHint ?? classifyRole(match.title ?? named.title),
            source: "job_posting",
          });
        }
      } catch {
        // Non-fatal — keep Apollo results.
      }
    }
    team = team.slice(0, maxContacts);
  }

  if (team.length === 0) {
    return {
      ok: true,
      job: {
        title: parsed.title,
        companyName: parsed.companyName,
        companyDomain: domain,
        location: parsed.location,
        description: parsed.description,
        url: sourceUrl,
        roleType,
        companyId,
        jobId,
      },
      searchTitles: titles,
      contacts: [],
      warnings: [
        ...warnings,
        domain
          ? `No hiring-team contacts found at ${domain}. Try pasting the full job description for named contacts.`
          : `Couldn't find people at ${parsed.companyName} in Apollo. Paste the full JD if it names a recruiter.`,
      ],
    };
  }

  // Warmth: match against imported / saved local contacts.
  const local = await listContacts({ limit: 5000 });
  const localByLinkedin = new Map(
    local
      .filter((c) => c.linkedin)
      .map((c) => [normalizeLinkedin(c.linkedin!), c]),
  );
  const localByName = new Map(
    local.map((c) => [c.name.trim().toLowerCase(), c]),
  );

  // Skip AI message drafting here — contacts load cheaply; drafts run on
  // demand via draftReachMessagesAction when the user clicks Write with AI.
  const contacts: ReachContactResult[] = await Promise.all(
    team.map(async (person) => {
      const localHit =
        (person.linkedinUrl
          ? localByLinkedin.get(normalizeLinkedin(person.linkedinUrl))
          : undefined) ?? localByName.get(person.name.trim().toLowerCase());

      let affiliations: { kind: string; detail: string }[] = [];
      if (localHit) {
        affiliations = (
          await convex().query(api.affiliations.listByContact, {
            contactId: localHit.id as never,
          })
        ).map((a) => ({ kind: a.kind, detail: a.detail }));
      }

      const warmth: "cold" | "warm" =
        localHit || affiliations.length > 0 ? "warm" : "cold";
      const warmReason = localHit
        ? localHit.source === "linkedin"
          ? "In your LinkedIn connections"
          : "Already saved in your network"
        : affiliations.length
          ? `Shared affiliation: ${affiliations[0]!.detail}`
          : null;

      return {
        apolloId: person.apolloId.startsWith("named:")
          ? null
          : person.apolloId,
        name: person.name,
        title: person.title,
        company: person.company,
        location: person.location,
        linkedinUrl: person.linkedinUrl,
        photoUrl: person.photoUrl,
        role: person.role,
        warmth,
        warmReason,
        source: person.source,
        savedContactId: localHit?.id ?? null,
        personAngle: null,
        messages: null,
        affiliations,
      };
    }),
  );

  if (jobId) revalidatePath("/board");
  revalidatePath(`/companies/${companyId}`);

  return {
    ok: true,
    job: {
      title: parsed.title,
      companyName: parsed.companyName,
      companyDomain: domain,
      location: parsed.location,
      description: parsed.description,
      url: sourceUrl,
      roleType,
      companyId,
      jobId,
    },
    searchTitles: titles,
    contacts,
    warnings,
  };
}

export async function draftReachMessagesAction(input: {
  job: {
    title: string;
    companyName: string;
    location: string | null;
    description: string;
  };
  contact: {
    name: string;
    title: string | null;
    role: ReachContactRole;
    warmth: "cold" | "warm";
    warmReason: string | null;
    affiliations: { kind: string; detail: string }[];
  };
}): Promise<
  | {
      ok: true;
      personAngle: string;
      messages: ReachDraftMessages;
    }
  | { ok: false; error: string }
> {
  if (!(await hasApiKey())) {
    return { ok: false, error: keyMessages.drafting };
  }
  const profile = await getProfile();
  if (!profile) {
    return {
      ok: false,
      error: "No profile yet — paste your resume in Settings first.",
    };
  }
  if (!input.contact.name.trim() || !input.job.title.trim()) {
    return { ok: false, error: "Missing contact or job context for drafting." };
  }

  const brief = [
    `Role: ${input.job.title} at ${input.job.companyName}`,
    input.job.location ? `Location: ${input.job.location}` : null,
    "",
    "Job context (from posting):",
    input.job.description.slice(0, 2000),
  ]
    .filter((l) => l !== null)
    .join("\n");

  try {
    const drafts = await draftReachMessages({
      profile,
      job: {
        title: input.job.title,
        companyName: input.job.companyName,
        location: input.job.location,
        description: input.job.description,
      },
      contact: {
        name: input.contact.name,
        title: input.contact.title,
        role: input.contact.role,
        warmth: input.contact.warmth,
        notes: input.contact.warmReason,
      },
      brief,
      affiliations: input.contact.affiliations,
    });
    return {
      ok: true,
      personAngle: drafts.personAngle,
      messages: drafts.channels,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Drafting failed",
    };
  }
}

export async function saveReachContactAction(input: {
  companyId: string;
  person: {
    apolloId: string | null;
    name: string;
    title: string | null;
    linkedinUrl: string | null;
    photoUrl: string | null;
  };
}): Promise<
  { ok: true; contactId: string } | { ok: false; error: string }
> {
  if (!input.person.name.trim()) {
    return { ok: false, error: "Missing contact name." };
  }
  if (!input.person.apolloId) {
    const id = await convex().mutation(api.contacts.save, {
      doc: cleanDoc({
        companyId: input.companyId,
        name: input.person.name.trim(),
        title: input.person.title,
        linkedin: input.person.linkedinUrl,
        photoUrl: input.person.photoUrl,
        source: "manual",
        outreachStatus: "none",
        createdAt: new Date().toISOString(),
      }),
    });
    revalidatePath("/network");
    revalidatePath(`/companies/${input.companyId}`);
    return { ok: true, contactId: id.id };
  }

  const person: ApolloPerson = {
    apolloId: input.person.apolloId,
    name: input.person.name,
    title: input.person.title,
    company: null,
    location: null,
    linkedinUrl: input.person.linkedinUrl,
    emailStatus: null,
    photoUrl: input.person.photoUrl,
  };
  const res = await convex().mutation(api.contacts.save, {
    doc: cleanDoc({
      companyId: input.companyId,
      name: person.name,
      title: person.title,
      linkedin: person.linkedinUrl,
      photoUrl: person.photoUrl,
      source: "apollo",
      apolloId: person.apolloId,
      outreachStatus: "none",
      createdAt: new Date().toISOString(),
    }),
  });
  revalidatePath("/network");
  revalidatePath(`/companies/${input.companyId}`);
  return { ok: true, contactId: res.id };
}

function namesMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase().replace(/\s+/g, " ");
  const nb = b.trim().toLowerCase().replace(/\s+/g, " ");
  if (na === nb) return true;
  const fa = na.split(" ")[0];
  const la = na.split(" ").slice(-1)[0];
  const fb = nb.split(" ")[0];
  const lb = nb.split(" ").slice(-1)[0];
  return Boolean(fa && la && fa === fb && la === lb);
}

function normalizeLinkedin(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}
