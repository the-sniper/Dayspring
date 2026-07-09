import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { 
  ArrowLeft, 
  ExternalLink, 
  History, 
  Users, 
  FileText, 
  Sparkles,
  MapPin,
  Building2,
  Check,
  Settings,
  Telescope
} from "lucide-react";
import ApplicationForm from "@/components/application-form";
import ApplyPanel from "@/components/apply-panel";
import DeleteForm from "@/components/delete-form";
import DraftOutreachButton from "@/components/draft-outreach-button";
import ResearchButton from "@/components/research-button";
import ResumeStudio from "@/components/resume-studio";
import RoleChip from "@/components/role-chip";
import ScoreBadge from "@/components/score-badge";
import ScoreJobButton from "@/components/score-job-button";
import StatusSelect from "@/components/status-select";
import TailorSection from "@/components/tailor-section";
import CompanyLogo from "@/components/company-logo";
import { getProfile } from "@/lib/jobs/score";
import { latestGeneratedForJob, mastersCount, resumePdfForJob } from "@/lib/resumes/core";
import { latestJobBrief } from "@/lib/research/core";
import { deleteJobAction, updateJobAction } from "@/lib/actions/jobs";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  contacts,
  jobs,
  stageEvents,
} from "@/lib/db/schema";
import { JOB_STATUSES, ROLE_TYPES } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-xl border border-border bg-secondary/30 p-3 text-sm transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  const row = db
    .select({ job: jobs, companyName: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, id))
    .get();
  if (!row) notFound();
  const { job, companyName } = row;

  const briefRow = latestJobBrief(job.id);
  const jobBrief = briefRow
    ? { brief: briefRow.brief, sources: briefRow.sources ?? [] }
    : null;

  const applyProfileReady = getProfile() !== null;
  // Tailored PDF → primary master PDF → static resumePath setting.
  const applyResumeReady = resumePdfForJob(job.id) !== null;
  const generated = latestGeneratedForJob(job.id);

  const application = db
    .select()
    .from(applications)
    .where(eq(applications.jobId, id))
    .get();

  const events = db
    .select()
    .from(stageEvents)
    .where(eq(stageEvents.jobId, id))
    .orderBy(desc(stageEvents.at))
    .all();

  const companyContacts = db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, job.companyId))
    .orderBy(contacts.name)
    .all();

  return (
    <div className="mx-auto max-w-5xl stagger-load">
      <Link 
        href="/board" 
        className="mb-8 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <ArrowLeft size={14} />
        Back to Board
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Main Content */}
        <div className="lg:col-span-8 space-y-8">
          <header className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <CompanyLogo name={companyName} className="h-14 w-14 text-xl" />
              <div>
                <h1 className="text-3xl font-black tracking-tight text-foreground leading-tight">
                  {job.title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-sm font-medium text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Building2 size={16} className="text-muted-foreground/50" />
                    <span className="text-foreground font-bold">{companyName}</span>
                  </div>
                  {job.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={16} className="text-muted-foreground/50" />
                      <span>{job.location}</span>
                    </div>
                  )}
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors cursor-pointer"
                    >
                      <ExternalLink size={16} />
                      <span>View Posting</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="shrink-0 pt-1">
              <StatusSelect jobId={job.id} status={job.status} statuses={JOB_STATUSES} />
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-3">
            <RoleChip role={job.roleType} />
            <div className="h-1 w-1 rounded-full bg-border" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Source: {job.source}</span>
            <div className="h-1 w-1 rounded-full bg-border" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Found {job.createdAt.slice(0, 10)}</span>
          </div>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Sparkles size={20} className="text-brand-500" />
                <h2 className="text-lg font-bold text-foreground">AI Match Analysis</h2>
              </div>
              <div className="flex items-center gap-4">
                {job.scoredAt && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Analyzed {job.scoredAt.slice(0, 10)}
                  </span>
                )}
                <ScoreBadge score={job.matchScore} />
                <ScoreJobButton jobId={job.id} force={job.matchScore !== null} />
              </div>
            </div>
            
            {job.fitSummary ? (
              <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                {job.fitSummary}
              </p>
            ) : (
              <div className="rounded-xl bg-secondary/30 p-8 text-center">
                <p className="text-sm font-bold text-muted-foreground">No analysis yet.</p>
                <p className="mt-1 text-xs text-muted-foreground/60">Run scoring to see how well you fit this role.</p>
              </div>
            )}
            
            {job.gapNotes && job.gapNotes.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {job.gapNotes.map((g) => (
                  <span
                    key={g}
                    className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-950/30 dark:text-brand-300 border border-brand-100 dark:border-brand-900/50"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Telescope size={20} className="text-brand-500" />
              <h2 className="text-lg font-bold text-foreground">Research</h2>
            </div>
            <p className="mb-4 text-xs font-medium text-muted-foreground">
              Current facts about the role & company (web search) — cited, and
              fed into tailoring + outreach so your materials reference real
              specifics.
            </p>
            <ResearchButton subjectType="job" id={job.id} existing={jobBrief} />
          </section>

          <TailorSection
            jobId={job.id}
            bullets={job.tailoredBullets}
            coverLetter={job.coverLetter}
            tailoredAt={job.tailoredAt}
          />

          <ResumeStudio
            jobId={job.id}
            initial={
              generated
                ? {
                    id: generated.id,
                    tailoringNote: generated.tailoringNote,
                    createdAt: generated.createdAt,
                  }
                : null
            }
            mastersCount={mastersCount()}
            hasApiKey={!!process.env.ANTHROPIC_API_KEY}
          />

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <ApplyPanel
              jobId={job.id}
              hasProfile={applyProfileReady}
              hasResume={applyResumeReady}
              hasTailored={!!(job.tailoredBullets?.length || job.coverLetter)}
              applyStatus={job.applyStatus}
            />
          </section>

          {job.description && (
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={20} className="text-brand-500" />
                <h2 className="text-lg font-bold text-foreground">Job Description</h2>
              </div>
              <div className="prose prose-stone dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-muted-foreground">
                  {job.description}
                </p>
              </div>
            </section>
          )}

          <details className="group rounded-2xl border border-border bg-card overflow-hidden transition-all">
            <summary className="flex cursor-pointer list-none items-center justify-between p-6 hover:bg-secondary/20 transition-colors">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-muted-foreground" />
                <h2 className="text-lg font-bold text-foreground">Edit Details</h2>
              </div>
              <div className="text-xs font-bold uppercase tracking-widest text-brand-600 group-open:hidden">Expand</div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground hidden group-open:block">Collapse</div>
            </summary>
            <div className="p-6 pt-0 border-t border-border/50">
              <form action={updateJobAction.bind(null, job.id)} className="mt-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <span className={labelCls}>Role Type</span>
                    <select name="roleType" defaultValue={job.roleType ?? ""} className={inputCls}>
                      <option value="">—</option>
                      {ROLE_TYPES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <span className={labelCls}>URL</span>
                    <input name="url" defaultValue={job.url ?? ""} className={inputCls} />
                  </div>
                </div>
                <div>
                  <span className={labelCls}>Location</span>
                  <input name="location" defaultValue={job.location ?? ""} className={inputCls} />
                </div>
                <div>
                  <span className={labelCls}>Description</span>
                  <textarea
                    name="description"
                    defaultValue={job.description}
                    rows={10}
                    className={inputCls}
                  />
                </div>
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Check size={16} strokeWidth={3} />
                  Save Changes
                </button>
              </form>
            </div>
          </details>
        </div>

        {/* Right Column: Sidebar */}
        <div className="lg:col-span-4 space-y-8">
          {application && (
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-widest text-foreground mb-4">Application</h2>
              <ApplicationForm jobId={job.id} values={application} />
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-foreground">
                <Users size={16} />
                Contacts
              </h2>
              <Link
                href={`/companies/${job.companyId}`}
                className="text-[10px] font-bold uppercase tracking-widest text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors cursor-pointer"
              >
                Find More
              </Link>
            </div>
            
            {companyContacts.length === 0 ? (
              <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                No contacts saved yet. A referral-backed application beats ten cold ones.
              </p>
            ) : (
              <div className="space-y-4">
                {companyContacts.map((c) => (
                  <div key={c.id} className="group relative rounded-xl border border-border bg-secondary/20 p-3 transition-all hover:border-brand-500/30">
                    <p className="text-sm font-bold text-foreground">{c.name}</p>
                    <p className="text-[11px] font-medium text-muted-foreground truncate">{c.title ?? "No title"}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {c.linkedin && (
                          <a
                            href={c.linkedin}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-brand-600 transition-colors cursor-pointer"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {c.outreachStatus !== "none" && (
                          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                            {c.outreachStatus}
                          </span>
                        )}
                      </div>
                      <DraftOutreachButton contactId={c.id} jobId={job.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-secondary/30 p-6">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-foreground mb-4">
              <History size={16} />
              History
            </h2>
            <div className="space-y-4">
              {events.map((e) => (
                <div key={e.id} className="relative pl-4 border-l-2 border-border pb-1 last:pb-0">
                  <div className="absolute -left-[5px] top-0 h-2 w-2 rounded-full bg-border" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
                    {e.at.slice(0, 16).replace("T", " ")}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-foreground">
                    {e.fromStatus ? (
                      <>
                        <span className="text-muted-foreground/50">{e.fromStatus}</span>
                        <span className="mx-1.5 text-muted-foreground/30">→</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/50 mr-1.5">Started as</span>
                    )}
                    <span className="text-brand-600 dark:text-brand-400">{e.toStatus}</span>
                  </p>
                </div>
              ))}
              {events.length === 0 && (
                <p className="text-xs font-medium text-muted-foreground italic">No transitions recorded.</p>
              )}
            </div>
          </section>

          <div className="pt-4">
            <DeleteForm
              action={deleteJobAction.bind(null, job.id)}
              confirmMessage="Are you sure you want to delete this job?"
              label="Delete Opportunity"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
