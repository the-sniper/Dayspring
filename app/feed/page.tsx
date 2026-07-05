import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import ErrorBanner from "@/components/error-banner";
import PullButton from "@/components/pull-button";
import RoleChip from "@/components/role-chip";
import ScoreBadge from "@/components/score-badge";
import { ignoreJobAction, promoteJobAction } from "@/lib/actions/jobs";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
import { ROLE_TYPES, type RoleType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ ignored?: string; role?: string; error?: string }>;
}) {
  const { ignored, role, error } = await searchParams;
  const showIgnored = ignored === "1";
  const status = showIgnored ? ("ignored" as const) : ("new" as const);
  const roleFilter: RoleType | "untyped" | null =
    role === "untyped"
      ? "untyped"
      : (ROLE_TYPES as readonly string[]).includes(role ?? "")
        ? (role as RoleType)
        : null;

  const rows = db
    .select({
      id: jobs.id,
      title: jobs.title,
      roleType: jobs.roleType,
      location: jobs.location,
      matchScore: jobs.matchScore,
      postedAt: jobs.postedAt,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(
      and(
        eq(jobs.status, status),
        roleFilter === "untyped"
          ? isNull(jobs.roleType)
          : roleFilter
            ? eq(jobs.roleType, roleFilter)
            : undefined,
      ),
    )
    // Scored-high first, unscored below (they get batch-scored, not read),
    // newest last-resort tiebreak.
    .orderBy(
      sql`${jobs.matchScore} is null`,
      desc(jobs.matchScore),
      desc(jobs.createdAt),
    )
    .all();

  const unscored = rows.filter((r) => r.matchScore === null).length;

  const filterHref = (r: string | null) => {
    const params = new URLSearchParams();
    if (showIgnored) params.set("ignored", "1");
    if (r) params.set("role", r);
    const q = params.toString();
    return q ? `/feed?${q}` : "/feed";
  };
  const chip = (active: boolean) =>
    `rounded-full px-2.5 py-0.5 text-xs font-medium ${
      active
        ? "bg-stone-900 text-white"
        : "bg-white text-stone-600 border border-stone-300 hover:bg-stone-100"
    }`;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            Feed {showIgnored && <span className="text-stone-400">· ignored</span>}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {rows.length} {showIgnored ? "ignored" : "new"} role
            {rows.length === 1 ? "" : "s"}
            {!showIgnored && unscored > 0 && ` · ${unscored} unscored`}
            {" · "}
            <Link
              href={showIgnored ? "/feed" : "/feed?ignored=1"}
              className="text-amber-700 hover:underline"
            >
              {showIgnored ? "show new" : "show ignored"}
            </Link>
          </p>
        </div>
        <PullButton />
      </div>
      <div className="mt-4">
        <ErrorBanner message={error} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Link href={filterHref(null)} className={chip(roleFilter === null)}>
          all
        </Link>
        {ROLE_TYPES.map((r) => (
          <Link key={r} href={filterHref(r)} className={chip(roleFilter === r)}>
            {r}
          </Link>
        ))}
        <Link
          href={filterHref("untyped")}
          className={chip(roleFilter === "untyped")}
        >
          untyped
        </Link>
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left text-xs uppercase tracking-wide text-stone-500">
            <th className="py-2 pr-3">Role</th>
            <th className="py-2 pr-3">Company</th>
            <th className="py-2 pr-3">Location</th>
            <th className="py-2 pr-3">Type</th>
            <th className="py-2 pr-3">Score</th>
            <th className="py-2 pr-3">Posted</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id} className="border-b border-stone-200 hover:bg-white">
              <td className="max-w-md py-2 pr-3">
                <Link
                  href={`/jobs/${j.id}`}
                  className="font-medium hover:text-amber-700"
                >
                  {j.title}
                </Link>
              </td>
              <td className="py-2 pr-3 text-stone-600">{j.companyName}</td>
              <td className="max-w-40 truncate py-2 pr-3 text-stone-500">
                {j.location ?? "—"}
              </td>
              <td className="py-2 pr-3">
                <RoleChip role={j.roleType} />
              </td>
              <td className="py-2 pr-3">
                <ScoreBadge score={j.matchScore} />
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums text-stone-400">
                {j.postedAt ? j.postedAt.slice(0, 10) : "—"}
              </td>
              <td className="py-2">
                <span className="flex justify-end gap-1">
                  <form action={promoteJobAction.bind(null, j.id)}>
                    <button
                      className="rounded bg-stone-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-stone-700"
                      title="Move to wishlist"
                    >
                      Promote
                    </button>
                  </form>
                  {!showIgnored && (
                    <form action={ignoreJobAction.bind(null, j.id)}>
                      <button className="rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100">
                        Ignore
                      </button>
                    </form>
                  )}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-10 text-center text-stone-400">
                {showIgnored
                  ? "Nothing ignored."
                  : "Feed is empty — hit “Pull new jobs” to fetch watched company boards."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
