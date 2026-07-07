import Link from "next/link";
import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { 
  ArrowLeft, 
  Building2, 
  Users, 
  Trash2, 
  Globe,
  LayoutDashboard
} from "lucide-react";
import CompanyForm from "@/components/company-form";
import ContactFinder from "@/components/contact-finder";
import ErrorBanner from "@/components/error-banner";
import CompanyLogo from "@/components/company-logo";
import {
  deleteCompanyAction,
  updateCompanyAction,
} from "@/lib/actions/companies";
import { db } from "@/lib/db";
import { companies, contacts, jobs } from "@/lib/db/schema";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import type { RoleType } from "@/lib/types";

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
  const id = Number(idRaw);
  const company = db.select().from(companies).where(eq(companies.id, id)).get();
  if (!company) notFound();

  const jobCount =
    db
      .select({ n: count() })
      .from(jobs)
      .where(eq(jobs.companyId, id))
      .get()?.n ?? 0;

  const savedContacts = db
    .select({
      id: contacts.id,
      name: contacts.name,
      title: contacts.title,
      email: contacts.email,
      linkedin: contacts.linkedin,
      emailStatus: contacts.emailStatus,
      outreachStatus: contacts.outreachStatus,
    })
    .from(contacts)
    .where(eq(contacts.companyId, id))
    .orderBy(contacts.name)
    .all();

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
            <h1 className="text-3xl font-black tracking-tight text-foreground leading-tight">
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
            <form 
              action={deleteCompanyAction.bind(null, id)} 
              onSubmit={(e) => {
                if (!confirm("Are you sure you want to delete this company?")) e.preventDefault();
              }}
            >
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 py-3 text-sm font-bold text-destructive transition-all hover:bg-destructive hover:text-white active:scale-95 cursor-pointer"
              >
                <Trash2 size={16} />
                Delete Company
              </button>
              <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                Blocked while jobs reference it
              </p>
            </form>
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
          </section>
        </div>
      </div>
    </div>
  );
}
