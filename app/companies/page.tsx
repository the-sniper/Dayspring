import Link from "next/link";
import { Building2, Plus, ArrowUpRight, ShieldCheck, Briefcase } from "lucide-react";
import CompanyForm from "@/components/company-form";
import ErrorBanner from "@/components/error-banner";
import RoleChip from "@/components/role-chip";
import CompanyLogo from "@/components/company-logo";
import PageHeader from "@/components/page-header";
import { createCompanyAction } from "@/lib/actions/companies";
import { api, convex } from "@/lib/convex/server";
import type { RoleType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const rows = (await convex().query(api.companies.withJobCounts, {}))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ company: c, jobCount: c.jobCount }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Directory"
        icon={<Building2 size={14} />}
        title="Companies"
        description={
          <span>
            Managing{" "}
            <span className="font-semibold text-foreground">{rows.length}</span>{" "}
            tracked organizations
          </span>
        }
        actions={
          <details className="group relative">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-[var(--radius)] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-foreground)] shadow-sm shadow-brand-500/20 transition-all hover:brightness-105 active:scale-[0.98]">
              <Plus size={16} strokeWidth={2.75} />
              Add company
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-[450px] rounded-2xl border border-border bg-popover p-6 shadow-2xl shadow-black/20">
              <h3 className="mb-4 font-display text-lg font-semibold text-foreground">
                Track New Company
              </h3>
              <CompanyForm action={createCompanyAction} submitLabel="Add Company" />
            </div>
          </details>
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-6 py-4">Company</th>
              <th className="px-4 py-4">ATS / Tracking</th>
              <th className="px-4 py-4">Hiring Roles</th>
              <th className="px-4 py-4 text-center">Visa</th>
              <th className="px-4 py-4 text-center">Jobs</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ company: c, jobCount }) => (
              <tr key={c.id} className="group transition-colors hover:bg-secondary/20">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <CompanyLogo name={c.name} className="h-10 w-10 text-xs" />
                    <div>
                      <Link
                        href={`/companies/${c.id}`}
                        className="font-bold text-foreground hover:text-brand-600 transition-colors cursor-pointer"
                      >
                        {c.name}
                      </Link>
                      {c.domain && (
                        <p className="text-xs font-medium text-muted-foreground">{c.domain}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-5">
                  {c.atsType && c.atsSlug ? (
                    <div className="flex flex-col gap-1">
                      <span className="w-fit rounded-md bg-stone-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        {c.atsType}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{c.atsSlug}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/30">—</span>
                  )}
                </td>
                <td className="px-4 py-5">
                  <div className="flex flex-wrap gap-1">
                    {(c.roleTypes ?? []).map((r) => (
                      <RoleChip key={r} role={r as RoleType} />
                    ))}
                    {(c.roleTypes ?? []).length === 0 && (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-5 text-center">
                  {c.visaSponsor ? (
                    <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <ShieldCheck size={14} strokeWidth={3} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground/30">—</span>
                  )}
                </td>
                <td className="px-4 py-5 text-center">
                  <div className="inline-flex items-center gap-1 font-bold tabular-nums text-foreground">
                    <Briefcase size={12} className="text-muted-foreground/50" />
                    {jobCount}
                  </div>
                </td>
                <td className="px-6 py-5 text-right">
                  <Link
                    href={`/companies/${c.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-all hover:border-brand-500 hover:text-brand-600 active:scale-95 cursor-pointer"
                  >
                    Edit
                    <ArrowUpRight size={12} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Building2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-foreground">No companies yet</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              New accounts auto-load the curated catalog — refresh in a moment, or add a company above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
