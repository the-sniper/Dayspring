import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import CompanyForm from "@/components/company-form";
import ContactFinder from "@/components/contact-finder";
import ErrorBanner from "@/components/error-banner";
import {
  deleteCompanyAction,
  updateCompanyAction,
} from "@/lib/actions/companies";
import { db } from "@/lib/db";
import { companies, contacts, jobs } from "@/lib/db/schema";
import { hasApolloKey } from "@/lib/integrations/apollo/client";
import type { RoleType } from "@/lib/types";

export const dynamic = "force-dynamic";

// Seed titles for the Apollo search from what this company hires for —
// recruiters + eng managers always, role-specific peers on top.
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
    <div>
      <h1 className="text-xl font-semibold">{company.name}</h1>
      <p className="mt-1 text-sm text-stone-500">
        {jobCount} job{jobCount === 1 ? "" : "s"} tracked
      </p>
      <div className="mt-4">
        <ErrorBanner message={error} />
      </div>
      <div className="mt-2">
        <CompanyForm
          action={updateCompanyAction.bind(null, id)}
          values={company}
          submitLabel="Save changes"
        />
      </div>
      <section className="mt-10">
        <h2 className="text-base font-semibold">Contacts</h2>
        <p className="mt-1 text-sm text-stone-500">
          The warm-application lane: find the recruiter or hiring manager,
          reveal an email only when you&apos;re actually going to write.
        </p>
        <div className="mt-3">
          <ContactFinder
            companyId={id}
            defaultTitles={defaultTitles(company.roleTypes)}
            savedContacts={savedContacts}
            hasApolloKey={hasApolloKey()}
            domainSet={!!company.domain}
          />
        </div>
      </section>

      <form action={deleteCompanyAction.bind(null, id)} className="mt-10">
        <button
          type="submit"
          className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Delete company
        </button>
        <span className="ml-2 text-xs text-stone-400">
          blocked while jobs reference it
        </span>
      </form>
    </div>
  );
}
