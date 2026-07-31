import Link from "next/link";
import { ArrowUpRight, Filter, Check } from "lucide-react";
import ErrorBanner from "@/components/error-banner";
import FeedFilters, { type FeedFilterValues } from "@/components/feed-filters";
import PullButton from "@/components/pull-button";
import RoleChip from "@/components/role-chip";
import ScoreBadge from "@/components/score-badge";
import ScoreButton from "@/components/score-button";
import CompanyLogo from "@/components/company-logo";
import Pagination from "@/components/pagination";
import PageHeader from "@/components/page-header";
import JobQuickActions from "@/components/job-quick-actions";
import Tip from "@/components/tip";
import TargetingPanel from "@/components/targeting-panel";
import { getTargetMaxHeadcount } from "@/lib/jobs/targeting";
import FeedSelection from "@/components/feed-selection";
import { api, convex } from "@/lib/convex/server";
import { MIN_JD_CHARS } from "@/lib/jobs/score";
import { formatSalary } from "@/lib/jobs/salary";
import { toLocationOptions } from "@/lib/jobs/location";
import {
  EMPLOYMENT_TYPES,
  ROLE_TYPES,
  WORKPLACE_TYPE_LABELS,
  WORKPLACE_TYPES,
  type EmploymentType,
  type RoleType,
  type WorkplaceType,
} from "@/lib/types";
import { LEVELS, LEVEL_LABELS, isLeadership, type Level } from "@/shared/seniority";
import { SIZE_BANDS, SIZE_SHORT, sizeBand, type SizeBand } from "@/shared/company-size";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = {
  ignored?: string;
  role?: string;
  workplace?: string;
  employment?: string;
  q?: string;
  loc?: string;
  salary?: string;
  posted?: string;
  score?: string;
  level?: string;
  size?: string;
  sort?: string;
  page?: string;
  error?: string;
};

const PAGE_SIZE = 25;

const posNum = (v?: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const showIgnored = sp.ignored === "1";
  const status = showIgnored ? ("ignored" as const) : ("new" as const);

  // These filters accept multiple comma-separated values.
  const parseCsv = (v?: string) =>
    (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const roleSel = parseCsv(sp.role);
  const roleTypes = roleSel.filter((r): r is RoleType =>
    (ROLE_TYPES as readonly string[]).includes(r),
  );
  const roleUntyped = roleSel.includes("untyped");
  const workplaceSel = parseCsv(sp.workplace).filter((w): w is WorkplaceType =>
    (WORKPLACE_TYPES as readonly string[]).includes(w),
  );
  const employmentSel = parseCsv(sp.employment).filter(
    (e): e is EmploymentType =>
      (EMPLOYMENT_TYPES as readonly string[]).includes(e),
  );
  const locSel = parseCsv(sp.loc);
  const levelSel = parseCsv(sp.level).filter((l): l is Level =>
    (LEVELS as readonly string[]).includes(l),
  );
  const sizeSel = parseCsv(sp.size).filter((s): s is SizeBand =>
    (SIZE_BANDS as readonly string[]).includes(s),
  );
  const q = (sp.q ?? "").trim();
  const minSalary = posNum(sp.salary);
  const postedDays = posNum(sp.posted);
  const minScore = posNum(sp.score);
  const sort = ["newest", "salary", "score"].includes(sp.sort ?? "")
    ? sp.sort!
    : "best";
  const page = Math.max(1, posNum(sp.page) ?? 1);

  const postedCutoff = postedDays
    ? new Date(Date.now() - postedDays * 86_400_000).toISOString()
    : null;

  const profile = await convex().query(api.profiles.getDefault, {});
  const profileUpdatedAt = profile?.updatedAt ?? null;

  const [feedResult, scorable, staleScores, locationValues, coverage] = await Promise.all([
    convex().query(api.jobs.feed, {
      status,
      roleTypes,
      roleUntyped,
      workplace: workplaceSel,
      employment: employmentSel,
      q,
      locs: locSel,
      minSalary,
      postedCutoff,
      minScore,
      levels: levelSel,
      sizes: sizeSel,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    convex().query(api.jobs.scorableCount, { minJdChars: MIN_JD_CHARS }),
    convex().query(api.jobs.staleScoreCount, { profileUpdatedAt }),
    convex().query(api.jobs.locationValues, {}),
    convex().query(api.targeting.targetingCoverage, {}),
  ]);

  // The ingestion ceiling is always shown, so the panel renders unconditionally.
  const maxHeadcount = await getTargetMaxHeadcount();

  const rows = feedResult.rows;
  const totalCount = feedResult.total;
  const unscored = rows.filter((r) => r.matchScore === null).length;
  const locationOptions = toLocationOptions(locationValues);

  const filterValues: FeedFilterValues = {
    q,
    role: [...roleTypes, ...(roleUntyped ? ["untyped"] : [])].join(","),
    workplace: workplaceSel.join(","),
    employment: employmentSel.join(","),
    loc: locSel.join(","),
    salary: minSalary ? String(minSalary) : "",
    posted: postedDays ? String(postedDays) : "",
    score: minScore ? String(minScore) : "",
    level: levelSel.join(","),
    size: sizeSel.join(","),
    sort: sort === "best" ? "" : sort,
  };

  return (
    <div className="mx-auto max-w-6xl stagger-load">
      <PageHeader
        eyebrow={showIgnored ? "Feed / Ignored" : "Feed / New Roles"}
        icon={<Filter size={14} />}
        title={showIgnored ? "Archive" : "Discovery"}
        description={
          <span>
            <span className="font-semibold text-foreground">{totalCount}</span>{" "}
            {showIgnored ? "ignored" : "new"} roles
            {!showIgnored && unscored > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-brand-600 dark:text-brand-400">
                  {unscored}
                </span>{" "}
                unscored here
              </>
            )}
            {" · "}
            <Link
              href={showIgnored ? "/feed" : "/feed?ignored=1"}
              className="font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
            >
              {showIgnored ? "View active" : "View ignored"}
            </Link>
          </span>
        }
        actions={
          <>
            <ScoreButton unscoredCount={scorable} />
            <PullButton />
          </>
        }
      />

      {sp.error && (
        <div className="mb-6">
          <ErrorBanner message={sp.error} />
        </div>
      )}
      
      {staleScores > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 text-sm text-brand-800 dark:border-brand-900/50 dark:bg-brand-950/20 dark:text-brand-300">
          <Check size={18} className="shrink-0 text-brand-600" />
          <p className="font-medium">
            {staleScores} scores predate your last profile edit. Rescore to stay accurate.
          </p>
        </div>
      )}

      <section className="relative z-20 mb-8">
        <TargetingPanel coverage={coverage} maxHeadcount={maxHeadcount} />
        <FeedFilters values={filterValues} locationOptions={locationOptions} />
      </section>

      <FeedSelection>
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="w-10 px-4 py-4">
                <input
                  type="checkbox"
                  data-select-all
                  aria-label="Select all jobs on this page"
                  className="h-4 w-4 cursor-pointer rounded border-border text-brand-500 focus:ring-brand-500"
                />
              </th>
              <th className="px-6 py-4">Role & Company</th>
              <th className="px-4 py-4">Location</th>
              <th className="px-4 py-4">Type</th>
              <th className="px-4 py-4">Salary</th>
              <th className="px-4 py-4 text-center">Score</th>
              <th className="px-4 py-4">Posted</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((j) => {
              const salary = formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency);
              return (
              <tr key={j.id} className="group transition-colors hover:bg-secondary/20">
                <td className="px-4 py-5">
                  <input
                    type="checkbox"
                    data-job-checkbox
                    data-job-id={j.id}
                    aria-label={`Select ${j.title} at ${j.companyName}`}
                    className="h-4 w-4 cursor-pointer rounded border-border text-brand-500 focus:ring-brand-500"
                  />
                </td>
                <td className="px-6 py-5 max-w-[300px]">
                  <div className="flex items-center gap-3">
                    <CompanyLogo name={j.companyName} className="h-9 w-9 text-xs" />
                    <div className="min-w-0">
                      <Tip label={j.title} placement="top">
                        <Link
                          href={`/jobs/${j.id}`}
                          className="flex items-center gap-1.5 font-bold text-foreground hover:text-brand-600 transition-colors"
                        >
                          <span className="truncate">{j.title}</span>
                          <ArrowUpRight size={14} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                      </Tip>
                      <p className="mt-0.5 flex items-center gap-1.5 font-medium text-muted-foreground truncate">
                        <span className="truncate">{j.companyName}</span>
                        {sizeBand(j.headcount) && (
                          <span
                            title={`~${j.headcount!.toLocaleString()} employees`}
                            className="shrink-0 rounded bg-stone-100 px-1 py-0.5 text-[9px] font-black tabular-nums text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                          >
                            {SIZE_SHORT[sizeBand(j.headcount)!]}
                          </span>
                        )}
                        {isLeadership(j.level as Level) && (
                          <span
                            title="Leadership role — typically needs direct-report history"
                            className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-black uppercase text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                          >
                            {LEVEL_LABELS[j.level as Level]}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-5 max-w-[200px]">
                  <div className="flex flex-col gap-1">
                    {j.workplaceType && (
                      <span className="w-fit rounded-md bg-stone-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        {WORKPLACE_TYPE_LABELS[j.workplaceType as keyof typeof WORKPLACE_TYPE_LABELS]}
                      </span>
                    )}
                    <span className="truncate font-medium text-muted-foreground">
                      {j.location ?? "—"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-5">
                  <RoleChip role={j.roleType} />
                </td>
                <td className="px-4 py-5 font-bold tabular-nums text-foreground whitespace-nowrap">
                  {salary ?? <span className="font-normal text-muted-foreground/30">—</span>}
                </td>
                <td className="px-4 py-5 text-center">
                  <ScoreBadge score={j.matchScore} />
                </td>
                <td className="px-4 py-5 text-xs font-medium tabular-nums text-muted-foreground whitespace-nowrap">
                  {j.postedAt ? j.postedAt.slice(0, 10) : "—"}
                </td>
                <td className="px-6 py-5 text-right">
                  <JobQuickActions jobId={j.id} showIgnore={!showIgnored} />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Filter size={24} />
            </div>
            <h3 className="text-lg font-bold text-foreground">No matches found</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {showIgnored
                ? "Your archive is empty."
                : "No US roles match these filters. Try broadening your search or pulling new jobs."}
            </p>
          </div>
        )}
        <Pagination 
          total={totalCount} 
          pageSize={PAGE_SIZE} 
          currentPage={page} 
        />
      </div>
      </FeedSelection>
    </div>
  );
}
