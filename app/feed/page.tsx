import Link from "next/link";
import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { ArrowUpRight, Filter, Check, X } from "lucide-react";
import ErrorBanner from "@/components/error-banner";
import FeedFilters, { type FeedFilterValues } from "@/components/feed-filters";
import PullButton from "@/components/pull-button";
import RoleChip from "@/components/role-chip";
import ScoreBadge from "@/components/score-badge";
import ScoreButton from "@/components/score-button";
import CompanyLogo from "@/components/company-logo";
import Pagination from "@/components/pagination";
import { ignoreJobAction, promoteJobAction } from "@/lib/actions/jobs";
import { db } from "@/lib/db";
import { companies, jobs, settings } from "@/lib/db/schema";
import { MIN_JD_CHARS } from "@/lib/jobs/score";
import { formatSalary } from "@/lib/jobs/salary";
import { toLocationOptions } from "@/lib/jobs/location";
import {
  EMPLOYMENT_TYPES,
  ROLE_TYPES,
  WORKPLACE_TYPE_LABELS,
  WORKPLACE_TYPES,
  type RoleType,
} from "@/lib/types";
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

  const roleFilter: RoleType | "untyped" | null =
    sp.role === "untyped"
      ? "untyped"
      : (ROLE_TYPES as readonly string[]).includes(sp.role ?? "")
        ? (sp.role as RoleType)
        : null;
  const workplace = (WORKPLACE_TYPES as readonly string[]).includes(
    sp.workplace ?? "",
  )
    ? sp.workplace!
    : "";
  const employment = (EMPLOYMENT_TYPES as readonly string[]).includes(
    sp.employment ?? "",
  )
    ? sp.employment!
    : "";
  const q = (sp.q ?? "").trim();
  const loc = (sp.loc ?? "").trim();
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

  const conditions: (SQL | undefined)[] = [
    eq(jobs.status, status),
    or(isNull(jobs.isUs), eq(jobs.isUs, true)),
    roleFilter === "untyped"
      ? isNull(jobs.roleType)
      : roleFilter
        ? eq(jobs.roleType, roleFilter)
        : undefined,
    workplace ? eq(jobs.workplaceType, workplace) : undefined,
    employment ? eq(jobs.employmentType, employment) : undefined,
    q
      ? or(
          sql`lower(${jobs.title}) like ${"%" + q.toLowerCase() + "%"}`,
          sql`lower(${companies.name}) like ${"%" + q.toLowerCase() + "%"}`,
        )
      : undefined,
    loc
      ? sql`lower(coalesce(${jobs.location}, '')) like ${"%" + loc.toLowerCase() + "%"}`
      : undefined,
    minSalary
      ? sql`coalesce(${jobs.salaryMax}, ${jobs.salaryMin}) >= ${minSalary}`
      : undefined,
    postedCutoff
      ? sql`coalesce(${jobs.postedAt}, ${jobs.createdAt}) >= ${postedCutoff}`
      : undefined,
    minScore ? gte(jobs.matchScore, minScore) : undefined,
  ];

  const orderBy =
    sort === "newest"
      ? [desc(sql`coalesce(${jobs.postedAt}, ${jobs.createdAt})`)]
      : sort === "salary"
        ? [
            sql`${jobs.salaryMax} is null`,
            desc(jobs.salaryMax),
            desc(jobs.createdAt),
          ]
        : sort === "score"
          ? [
              sql`${jobs.matchScore} is null`,
              desc(jobs.matchScore),
              desc(jobs.createdAt),
            ]
          :             [
              sql`${jobs.matchScore} is null`,
              desc(jobs.matchScore),
              desc(jobs.createdAt),
            ];

  const totalCount = db
    .select({ n: sql<number>`count(*)` })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(...conditions))
    .get()?.n ?? 0;

  const rows = db
    .select({
      id: jobs.id,
      title: jobs.title,
      roleType: jobs.roleType,
      location: jobs.location,
      workplaceType: jobs.workplaceType,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      salaryCurrency: jobs.salaryCurrency,
      matchScore: jobs.matchScore,
      postedAt: jobs.postedAt,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)
    .all();

  const unscored = rows.filter((r) => r.matchScore === null).length;

  const scorable =
    db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(
        and(
          isNull(jobs.matchScore),
          sql`${jobs.status} in ('new','wishlist')`,
          sql`length(${jobs.description}) >= ${MIN_JD_CHARS}`,
        ),
      )
      .get()?.n ?? 0;

  const profileUpdatedAt =
    db.select().from(settings).where(eq(settings.key, "profile")).get()
      ?.updatedAt ?? null;
  const staleScores = profileUpdatedAt
    ? (db
        .select({ n: sql<number>`count(*)` })
        .from(jobs)
        .where(
          and(isNotNull(jobs.scoredAt), sql`${jobs.scoredAt} < ${profileUpdatedAt}`),
        )
        .get()?.n ?? 0)
    : 0;

  const locationOptions = toLocationOptions(
    db
      .selectDistinct({ location: jobs.location })
      .from(jobs)
      .where(
        and(
          or(isNull(jobs.isUs), eq(jobs.isUs, true)),
          isNotNull(jobs.location),
        ),
      )
      .all()
      .map((r) => r.location),
  );

  const filterValues: FeedFilterValues = {
    q,
    role: roleFilter ?? "",
    workplace,
    employment,
    loc,
    salary: minSalary ? String(minSalary) : "",
    posted: postedDays ? String(postedDays) : "",
    score: minScore ? String(minScore) : "",
    sort: sort === "best" ? "" : sort,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Link href="/feed" className="text-xs font-bold uppercase tracking-widest hover:text-foreground transition-colors">Feed</Link>
            <span className="text-muted-foreground/30">/</span>
            <span className="text-xs font-bold uppercase tracking-widest text-foreground">{showIgnored ? "Ignored" : "New Roles"}</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground">
            {showIgnored ? "Archive" : "Discovery"}
          </h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            <span className="text-foreground font-bold">{totalCount}</span> {showIgnored ? "ignored" : "new"} roles
            {!showIgnored && unscored > 0 && (
              <> · <span className="text-brand-600 dark:text-brand-400 font-bold">{unscored}</span> unscored on this page</>
            )}
            {" · "}
            <Link
              href={showIgnored ? "/feed" : "/feed?ignored=1"}
              className="font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors"
            >
              {showIgnored ? "View Active" : "View Ignored"}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScoreButton unscoredCount={scorable} />
          <PullButton />
        </div>
      </header>

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
        <FeedFilters values={filterValues} locationOptions={locationOptions} />
      </section>

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
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
                <td className="px-6 py-5 max-w-[300px]">
                  <div className="flex items-center gap-3">
                    <CompanyLogo name={j.companyName} className="h-9 w-9 text-xs" />
                    <div className="min-w-0">
                      <Link
                        href={`/jobs/${j.id}`}
                        title={j.title}
                        className="flex items-center gap-1.5 font-bold text-foreground hover:text-brand-600 transition-colors"
                      >
                        <span className="truncate">{j.title}</span>
                        <ArrowUpRight size={14} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                      <p className="mt-0.5 font-medium text-muted-foreground truncate">{j.companyName}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-5 max-w-[200px]">
                  <div className="flex flex-col gap-1">
                    {j.workplaceType && (
                      <span className="w-fit rounded-md bg-stone-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        {WORKPLACE_TYPE_LABELS[j.workplaceType]}
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
                  <div className="flex justify-end gap-2">
                    <form action={promoteJobAction.bind(null, j.id)}>
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-all hover:scale-110 active:scale-95"
                        title="Promote to wishlist"
                      >
                        <Check size={16} strokeWidth={3} />
                      </button>
                    </form>
                    {!showIgnored && (
                      <form action={ignoreJobAction.bind(null, j.id)}>
                        <button 
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:border-destructive hover:text-destructive active:scale-95"
                          title="Ignore role"
                        >
                          <X size={16} strokeWidth={3} />
                        </button>
                      </form>
                    )}
                  </div>
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
    </div>
  );
}
