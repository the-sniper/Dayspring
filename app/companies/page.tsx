import Link from "next/link";
import { count, eq } from "drizzle-orm";
import CompanyForm from "@/components/company-form";
import ErrorBanner from "@/components/error-banner";
import RoleChip from "@/components/role-chip";
import { createCompanyAction } from "@/lib/actions/companies";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const rows = db
    .select({ company: companies, jobCount: count(jobs.id) })
    .from(companies)
    .leftJoin(jobs, eq(jobs.companyId, companies.id))
    .groupBy(companies.id)
    .orderBy(companies.name)
    .all();

  return (
    <div>
      <h1 className="text-xl font-semibold">Companies</h1>
      <p className="mt-1 text-sm text-stone-500">
        Rows with an ATS + slug are watched — the feed pulls their boards.
      </p>
      <div className="mt-4">
        <ErrorBanner message={error} />
      </div>

      <table className="mt-2 w-full max-w-4xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left text-xs uppercase tracking-wide text-stone-500">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">ATS</th>
            <th className="py-2 pr-4">Roles</th>
            <th className="py-2 pr-4">Visa</th>
            <th className="py-2 pr-4">Jobs</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ company: c, jobCount }) => (
            <tr key={c.id} className="border-b border-stone-200">
              <td className="py-2 pr-4 font-medium">{c.name}</td>
              <td className="py-2 pr-4 text-stone-600">
                {c.atsType && c.atsSlug ? `${c.atsType}/${c.atsSlug}` : "—"}
              </td>
              <td className="py-2 pr-4">
                <span className="flex gap-1">
                  {(c.roleTypes ?? []).map((r) => (
                    <RoleChip key={r} role={r} />
                  ))}
                </span>
              </td>
              <td className="py-2 pr-4">{c.visaSponsor ? "✓" : "—"}</td>
              <td className="py-2 pr-4 tabular-nums">{jobCount}</td>
              <td className="py-2">
                <Link
                  href={`/companies/${c.id}`}
                  className="text-amber-700 hover:underline"
                >
                  edit
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-stone-400">
                No companies yet — add one below or run <code>npm run seed</code>.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 className="mt-10 text-base font-semibold">Add company</h2>
      <div className="mt-3">
        <CompanyForm action={createCompanyAction} submitLabel="Add company" />
      </div>
    </div>
  );
}
