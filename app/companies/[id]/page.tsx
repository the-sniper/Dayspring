import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Users,
  Globe,
  LayoutDashboard,
  Telescope
} from "lucide-react";
import CompanyForm from "@/components/company-form";
import ContactFinder from "@/components/contact-finder";
import NetworkFinder from "@/components/network-finder";
import ResearchButton from "@/components/research-button";
import DeleteForm from "@/components/delete-form";
import ErrorBanner from "@/components/error-banner";
import CompanyLogo from "@/components/company-logo";
import {
  deleteCompanyAction,
  updateCompanyAction,
} from "@/lib/actions/companies";
import { api, convex } from "@/lib/convex/server";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import { hasHappenstanceKey } from "@/lib/integrations/happenstance/client";
import { latestCompanyBrief } from "@/lib/research/core";
import type { AtsType, RoleType } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_TITLES: Record<RoleType, string[]> = {
  FDE: ["solutions engineer", "forward deployed engineer"],
  FE: ["frontend engineer"],
  BE: ["backend engineer"],
  FS: ["software engineer"],
  DATA: ["data scientist", "machine learning engineer"],
};

function defaultTitles(roleTypes: RoleType[] | null): string[] {
  const base = ["technical recruiter", "engineering manager"];
  const extra = (roleTypes ?? []).flatMap((r) => ROLE_TITLES[r]);
  return [...new Set([...base, ...extra])];
}

export default async function CompanyEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: idRaw } = await params;
  const { error } = await searchParams;
  const id = idRaw;
  const companyDoc = await convex().query(api.companies.getById, { id: id as never });
  if (!companyDoc) notFound();
  const company = {
    ...companyDoc,
    id: companyDoc._id,
    atsType: (companyDoc.atsType ?? null) as AtsType | null,
    roleTypes: (companyDoc.roleTypes ?? null) as RoleType[] | null,
  };

  const cBriefRow = await latestCompanyBrief(id);
  const companyBrief = cBriefRow
    ? { brief: cBriefRow.brief, sources: cBriefRow.sources ?? [] }
    : null;

  const [jobCount, savedContactsRaw] = await Promise.all([
    convex().query(api.companies.jobCount, { id: id as never }),
    convex().query(api.contacts.byCompany, { companyId: id as never }),
  ]);

  const savedContacts = savedContactsRaw
    .map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title ?? null,
      email: c.email ?? null,
      linkedin: c.linkedin ?? null,
      photoUrl: c.photoUrl ?? null,
      emailStatus: c.emailStatus ?? null,
      outreachStatus: c.outreachStatus,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <Link 
          href="/companies" 
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to Directory
        </Link>
        <div className="flex items-center gap-2 text-muted-foreground">
          <LayoutDashboard size={14} />
          <span className="text-xs font-bold uppercase tracking-widest">Configuration</span>
        </div>
      </div>

      <header className="mb-10 flex items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <CompanyLogo name={company.name} className="h-14 w-14 text-xl" />
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground leading-tight">
              {company.name}
            </h1>
            <div className="mt-2 flex items-center gap-4 text-sm font-medium text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Building2 size={16} className="text-muted-foreground/50" />
                <span className="text-foreground font-bold">{jobCount} jobs tracked</span>
              </div>
              {company.domain && (
                <div className="flex items-center gap-1.5">
                  <Globe size={16} className="text-muted-foreground/50" />
                  <span>{company.domain}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-8">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Telescope size={20} className="text-brand-500" />
              <h2 className="text-lg font-bold text-foreground">Research</h2>
            </div>
            <p className="mb-4 text-xs font-medium text-muted-foreground">
              Current company intel (web search) — cited, and reused across
              every role you tailor or reach out about here.
            </p>
            <ResearchButton
              subjectType="company"
              id={id}
              existing={companyBrief}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-6 flex items-center gap-2 text-lg font-bold text-foreground">
              <Building2 size={20} className="text-brand-500" />
              Company Details
            </h2>
            <CompanyForm
              action={updateCompanyAction.bind(null, id)}
              values={company}
              submitLabel="Save changes"
            />
          </section>

          <div className="pt-4">
            <DeleteForm
              action={deleteCompanyAction.bind(null, id)}
              confirmMessage="Are you sure you want to delete this company?"
              label="Delete Company"
              helperText="Blocked while jobs reference it"
            />
          </div>
        </div>

        <div className="lg:col-span-5">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Users size={20} className="text-brand-500" />
                Contacts
              </h2>
            </div>
            <p className="mb-6 text-xs font-medium text-muted-foreground leading-relaxed">
              The warm-application lane: find the recruiter or hiring manager,
              reveal an email only when you&apos;re actually going to write.
            </p>
            <ContactFinder
              companyId={id}
              defaultTitles={defaultTitles(company.roleTypes)}
              savedContacts={savedContacts}
              hasApolloKey={hasApolloKey()}
              domainSet={!!company.domain}
            />

            <div className="mt-6 border-t border-border pt-6">
              <NetworkFinder
                companyId={id}
                hasKey={hasHappenstanceKey()}
                seedQuery={`who do I know at ${company.name}?`}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
