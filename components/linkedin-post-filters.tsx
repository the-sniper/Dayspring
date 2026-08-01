"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Loader2 } from "lucide-react";
import {
  DEFAULT_POST_SORT,
  POST_SORT_OPTIONS,
  type PostSort,
} from "@/shared/linkedin-posts";

const POSTED_OPTIONS = [
  ["", "Any time"],
  ["1", "Past 24 hours"],
  ["3", "Past 3 days"],
  ["7", "Past week"],
  ["14", "Past 2 weeks"],
  // Portal hard-caps at 15 days (shared/job-retention.ts) — no older option.
] as const;

const SELECT_CLS =
  "cursor-pointer rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

// Soft-navigates the posts feed. A plain GET <form> remounts the whole RSC
// tree (and the page header / tabs / queries panel with it); router.push keeps
// the shell and only re-renders the results. Page size lives on the bottom
// Pagination control — not here.
export default function LinkedinPostFilters({
  q: initialQ,
  withLinkOnly: initialWithLink,
  posted: initialPosted,
  sort: initialSort,
  totalCount,
}: {
  q: string;
  withLinkOnly: boolean;
  posted: string;
  sort: PostSort;
  totalCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQ);
  const [withLinkOnly, setWithLinkOnly] = useState(initialWithLink);
  const [posted, setPosted] = useState(initialPosted);
  const [sort, setSort] = useState(initialSort);
  const [pending, startTransition] = useTransition();

  useEffect(() => setQ(initialQ), [initialQ]);
  useEffect(() => setWithLinkOnly(initialWithLink), [initialWithLink]);
  useEffect(() => setPosted(initialPosted), [initialPosted]);
  useEffect(() => setSort(initialSort), [initialSort]);

  function apply(next: {
    q: string;
    withLinkOnly: boolean;
    posted: string;
    sort: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q.trim()) params.set("q", next.q.trim());
    else params.delete("q");
    if (next.withLinkOnly) params.set("link", "1");
    else params.delete("link");
    if (next.posted) params.set("posted", next.posted);
    else params.delete("posted");
    if (next.sort && next.sort !== DEFAULT_POST_SORT) params.set("sort", next.sort);
    else params.delete("sort");
    // Filter / sort changes always reset to page 1; keep `per` as-is.
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  const filtersActive = Boolean(q.trim() || withLinkOnly || posted);

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q, withLinkOnly, posted, sort });
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search posts, authors, companies…"
          aria-label="Search posts"
          className="min-w-[220px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <select
          value={posted}
          aria-label="Posted within"
          onChange={(e) => {
            const next = e.target.value;
            setPosted(next);
            apply({ q, withLinkOnly, posted: next, sort });
          }}
          className={SELECT_CLS}
        >
          {POSTED_OPTIONS.map(([value, label]) => (
            <option key={label} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground">
          <input
            type="checkbox"
            checked={withLinkOnly}
            onChange={(e) => {
              const next = e.target.checked;
              setWithLinkOnly(next);
              // Instant — no reason to wait for a separate Filter click for a toggle.
              apply({ q, withLinkOnly: next, posted, sort });
            }}
            className="h-4 w-4 cursor-pointer rounded border-border text-brand-500 focus:ring-brand-500"
          />
          Has job link
        </label>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-all active:scale-95 disabled:opacity-60"
        >
          {pending && <Loader2 size={12} className="animate-spin" />}
          Filter
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              Updating…
            </span>
          ) : (
            <>
              <span className="font-bold tabular-nums text-foreground">
                {totalCount.toLocaleString()}
              </span>{" "}
              {totalCount === 1 ? "result" : "results"}
              {filtersActive && (
                <span className="text-muted-foreground/70"> matching filters</span>
              )}
            </>
          )}
        </p>
        <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <ArrowUpDown size={12} />
          <span className="uppercase tracking-widest">Sort</span>
          <select
            value={sort}
            aria-label="Sort posts"
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value as PostSort;
              setSort(next);
              apply({ q, withLinkOnly, posted, sort: next });
            }}
            className="cursor-pointer rounded-lg border border-border bg-card px-2 py-1 text-xs font-bold text-foreground transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
          >
            {POST_SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
