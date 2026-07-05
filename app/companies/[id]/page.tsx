import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import CompanyForm from "@/components/company-form";
import ErrorBanner from "@/components/error-banner";
import {
  deleteCompanyAction,
  updateCompanyAction,
} from "@/lib/actions/companies";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

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
      <form action={deleteCompanyAction.bind(null, id)} className="mt-8">
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
