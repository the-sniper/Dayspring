import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { 
  KanbanSquare, 
  Plus, 
  Search, 
  MoreVertical, 
  ArrowUpRight,
  Inbox,
  Layout
} from "lucide-react";
import ErrorBanner from "@/components/error-banner";
import JobForm from "@/components/job-form";
import ScoreBadge from "@/components/score-badge";
import StatusSelect from "@/components/status-select";
import CompanyLogo from "@/components/company-logo";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
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
  const rows = db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      matchScore: jobs.matchScore,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(inArray(jobs.status, [...KANBAN_STATUSES]))
    .orderBy(jobs.updatedAt)
    .all();

  const byStatus = new Map<JobStatus, typeof rows>(
    KANBAN_STATUSES.map((s) => [s, []]),
  );
  for (const r of rows) byStatus.get(r.status)?.push(r);

  const companyNames = db
    .select({ name: companies.name })
    .from(companies)
    .orderBy(companies.name)
    .all()
    .map((c) => c.name);

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <KanbanSquare size={14} />
            <span className="text-xs font-bold uppercase tracking-widest">Pipeline</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground">
            Board
          </h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            <span className="text-foreground">{rows.length}</span> active opportunities
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-105 active:scale-95">
              <Plus size={18} strokeWidth={3} />
              Add Manually
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-[400px] rounded-2xl border border-border bg-popover p-5 shadow-2xl shadow-black/20">
              <h3 className="mb-4 text-lg font-bold text-foreground">New Opportunity</h3>
              <JobForm companyNames={companyNames} />
            </div>
          </details>
        </div>
      </header>

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
