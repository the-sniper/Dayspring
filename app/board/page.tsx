import Link from "next/link";
import { 
  KanbanSquare, 
  Plus, 
  ArrowUpRight,
  Layout
} from "lucide-react";
import ErrorBanner from "@/components/error-banner";
import JobForm from "@/components/job-form";
import ScoreBadge from "@/components/score-badge";
import StatusSelect from "@/components/status-select";
import CompanyLogo from "@/components/company-logo";
import PageHeader from "@/components/page-header";
import { api, convex } from "@/lib/convex/server";
import { KANBAN_STATUSES, type JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const columnLabels: Record<string, string> = {
  wishlist: "Wishlist",
  applied: "Applied",
  screen: "Screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const [kanbanJobs, allCompanies] = await Promise.all([
    convex().query(api.jobs.byStatuses, { statuses: [...KANBAN_STATUSES] }),
    convex().query(api.companies.listAll, {}),
  ]);

  const rows = kanbanJobs
    .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""))
    .map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status as JobStatus,
      matchScore: j.matchScore ?? null,
      companyName: j.companyName,
    }));

  const byStatus = new Map<JobStatus, typeof rows>(
    KANBAN_STATUSES.map((s) => [s, []]),
  );
  for (const r of rows) byStatus.get(r.status)?.push(r);

  const companyNames = allCompanies
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Pipeline"
        icon={<KanbanSquare size={14} />}
        title="Board"
        description={
          <span>
            <span className="font-semibold text-foreground">{rows.length}</span>{" "}
            active opportunities
          </span>
        }
        actions={
          <details className="group relative">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-[var(--radius)] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-foreground)] shadow-sm shadow-brand-500/20 transition-all hover:brightness-105 active:scale-[0.98]">
              <Plus size={16} strokeWidth={2.75} />
              Add manually
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-[400px] rounded-2xl border border-border bg-popover p-5 shadow-2xl shadow-black/20">
              <h3 className="mb-4 font-display text-lg font-semibold text-foreground">
                New Opportunity
              </h3>
              <JobForm companyNames={companyNames} />
            </div>
          </details>
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-6 overflow-x-auto pb-8">
        <div className="flex gap-4 min-w-max">
          {KANBAN_STATUSES.map((status) => {
            const col = byStatus.get(status) ?? [];
            return (
              <div key={status} className="w-72 shrink-0">
                <div className="mb-4 flex items-center justify-between px-2">
                  <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      status === 'wishlist' && "bg-stone-400",
                      status === 'applied' && "bg-blue-400",
                      status === 'screen' && "bg-purple-400",
                      status === 'interview' && "bg-brand-500",
                      status === 'offer' && "bg-emerald-500",
                      status === 'rejected' && "bg-rose-500",
                    )} />
                    {columnLabels[status]}
                    <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground/60">
                      {col.length}
                    </span>
                  </h2>
                </div>
                
                <div className="flex flex-col gap-3 min-h-[500px] rounded-2xl bg-secondary/30 p-3 border border-border/50">
                  {col.map((job) => (
                    <div
                      key={job.id}
                      className="group relative rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-brand-500/50 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <CompanyLogo name={job.companyName} className="h-8 w-8 text-[10px]" />
                        <ScoreBadge score={job.matchScore} />
                      </div>
                      
                      <Link
                        href={`/jobs/${job.id}`}
                        title={job.title}
                        className="block text-sm font-bold leading-tight text-foreground hover:text-brand-600 transition-colors cursor-pointer"
                      >
                        {job.title}
                      </Link>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        {job.companyName}
                      </p>
                      
                      <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                        <StatusSelect jobId={job.id} status={job.status} />
                        <Link 
                          href={`/jobs/${job.id}`}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                      </div>
                    </div>
                  ))}
                  {col.length === 0 && (
                    <div className="flex flex-1 flex-col items-center justify-center text-center opacity-40">
                      <Layout size={24} className="mb-2 text-muted-foreground" />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Empty
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
