import Link from "next/link";
import { Megaphone } from "lucide-react";
import ErrorBanner from "@/components/error-banner";
import FeedTabs from "@/components/feed-tabs";
import LinkedinMarkAllDone from "@/components/linkedin-mark-all-done";
import LinkedinPostCard, { type PostView } from "@/components/linkedin-post-card";
import LinkedinPostFilters from "@/components/linkedin-post-filters";
import LinkedinPullButton from "@/components/linkedin-pull-button";
import LinkedinQueriesPanel from "@/components/linkedin-queries-panel";
import PageHeader from "@/components/page-header";
import Pagination from "@/components/pagination";
import { api, convex } from "@/lib/convex/server";
import { hasLinkedinPostsKey } from "@/lib/integrations/linkedin/posts";
import { getLastPostPullAt, getPostQueries } from "@/lib/linkedin/pull";
import { getSetting } from "@/lib/settings/store";
import { JOB_MAX_AGE_DAYS } from "@/shared/job-retention";
import {
  DEFAULT_POST_PAGE_SIZE,
  DEFAULT_POST_SORT,
  POST_PAGE_SIZES,
  POST_QUERIES_KEY,
  POST_SORT_OPTIONS,
  type PostSort,
  type PostStatus,
} from "@/shared/linkedin-posts";

export const dynamic = "force-dynamic";

type SearchParams = {
  ignored?: string;
  saved?: string;
  done?: string;
  q?: string;
  link?: string;
  posted?: string;
  sort?: string;
  per?: string;
  page?: string;
  error?: string;
};

const posNum = (v?: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const STATUS_LABEL: Record<PostStatus, string> = {
  new: "untriaged",
  saved: "saved",
  done: "done",
  ignored: "ignored",
};

function statusFromParams(sp: SearchParams): PostStatus {
  if (sp.done === "1") return "done";
  if (sp.saved === "1") return "saved";
  if (sp.ignored === "1") return "ignored";
  return "new";
}

function viewHref(status: PostStatus): string {
  if (status === "done") return "/feed/posts?done=1";
  if (status === "saved") return "/feed/posts?saved=1";
  if (status === "ignored") return "/feed/posts?ignored=1";
  return "/feed/posts";
}

export default async function FeedPostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = statusFromParams(sp);
  const withLinkOnly = sp.link === "1";
  const q = (sp.q ?? "").trim();
  const postedDaysRaw = posNum(sp.posted);
  const postedDays =
    postedDaysRaw != null
      ? Math.min(postedDaysRaw, JOB_MAX_AGE_DAYS)
      : null;
  const posted = postedDays ? String(postedDays) : "";
  const postedCutoff = postedDays
    ? new Date(Date.now() - postedDays * 86_400_000).toISOString()
    : null;
  const sortValues = POST_SORT_OPTIONS.map(([v]) => v) as readonly string[];
  const sort: PostSort = sortValues.includes(sp.sort ?? "")
    ? (sp.sort as PostSort)
    : DEFAULT_POST_SORT;
  const perRaw = posNum(sp.per);
  const pageSize =
    perRaw && (POST_PAGE_SIZES as readonly number[]).includes(perRaw)
      ? perRaw
      : DEFAULT_POST_PAGE_SIZE;
  const pageNum = Number(sp.page);
  const requestedPage =
    Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1;

  const [feedResult, counts, queries, savedQueries, hasKey, lastPullAt] =
    await Promise.all([
      convex().query(api.linkedinPosts.feed, {
        status,
        q,
        withLinkOnly,
        postedCutoff,
        sort,
        page: requestedPage,
        pageSize,
      }),
      convex().query(api.linkedinPosts.counts, {}),
      getPostQueries(),
      getSetting(POST_QUERIES_KEY),
      hasLinkedinPostsKey(),
      getLastPostPullAt(),
    ]);

  const rows = (feedResult?.rows ?? []) as PostView[];
  const totalCount = feedResult?.total ?? 0;
  // Convex clamps out-of-range pages and echoes the effective one.
  const page = feedResult?.page ?? requestedPage;
  const withLink = rows.filter((r) => r.jobUrl).length;

  return (
    <div className="mx-auto max-w-4xl stagger-load">
      <PageHeader
        eyebrow="Feed / LinkedIn Posts"
        icon={<Megaphone size={14} />}
        title={status === "done" ? "Done posts" : "Hiring posts"}
        description={
          <span>
            <span className="font-semibold text-foreground">
              {totalCount}
            </span>{" "}
            {STATUS_LABEL[status]} posts
            {status === "new" && withLink > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-brand-600 dark:text-brand-400">
                  {withLink}
                </span>{" "}
                with a job link on this page
              </>
            )}
            {" · "}
            {status !== "new" ? (
              <Link
                href="/feed/posts"
                className="font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
              >
                View untriaged
              </Link>
            ) : (
              <>
                <Link
                  href={viewHref("done")}
                  className="font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
                >
                  Done ({counts?.done ?? 0})
                </Link>
                {" · "}
                <Link
                  href={viewHref("saved")}
                  className="font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
                >
                  Saved ({counts?.saved ?? 0})
                </Link>
                {" · "}
                <Link
                  href={viewHref("ignored")}
                  className="font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
                >
                  Ignored ({counts?.ignored ?? 0})
                </Link>
              </>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {status === "new" && rows.length > 0 && (
              <LinkedinMarkAllDone postIds={rows.map((r) => r.id)} />
            )}
            <LinkedinPullButton />
          </div>
        }
      />

      <FeedTabs postCount={counts?.new ?? 0} />

      {sp.error && (
        <div className="mb-6">
          <ErrorBanner message={sp.error} />
        </div>
      )}

      <section className="mb-6">
        {status === "new" && (
          <LinkedinQueriesPanel
            queries={queries}
            isDefault={savedQueries === null}
            hasKey={hasKey}
            lastPullAt={lastPullAt}
          />
        )}

        <LinkedinPostFilters
          q={q}
          withLinkOnly={withLinkOnly}
          posted={posted}
          sort={sort}
          totalCount={totalCount}
        />
      </section>

      <div className="space-y-4">
        {rows.map((post) => (
          <LinkedinPostCard
            key={post.id}
            post={post}
            showTriage={status === "new" || status === "saved"}
          />
        ))}
      </div>

      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Megaphone size={24} />
          </div>
          <h3 className="text-lg font-bold text-foreground">No posts here</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {status === "done"
              ? "Mark posts Done from the untriaged feed and they'll land here — and stay off later searches."
              : status !== "new"
                ? "Nothing in this view yet."
                : hasKey
                  ? "Run a search to pull LinkedIn posts announcing open roles."
                  : "Add your Apify API token in Settings → API Keys, then run a search."}
          </p>
        </div>
      )}

      {totalCount > 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card">
          <Pagination
            total={totalCount}
            pageSize={pageSize}
            currentPage={page}
            pageSizes={POST_PAGE_SIZES}
          />
        </div>
      )}
    </div>
  );
}
