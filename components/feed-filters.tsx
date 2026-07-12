"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, MapPin, Briefcase, DollarSign, Calendar, Star, X } from "lucide-react";
import MultiSelect, { type MultiSelectOption } from "@/components/multi-select";
import {
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  ROLE_TYPE_LABELS,
  ROLE_TYPES,
  WORKPLACE_TYPE_LABELS,
  WORKPLACE_TYPES,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// Filters that hold multiple comma-separated values in the URL.
const csv = (v: string): string[] => (v ? v.split(",").filter(Boolean) : []);

const ROLE_OPTIONS: MultiSelectOption[] = [
  ...ROLE_TYPES.map((r) => ({ value: r, label: ROLE_TYPE_LABELS[r] })),
  { value: "untyped", label: "Untyped" },
];
const WORKPLACE_OPTIONS: MultiSelectOption[] = WORKPLACE_TYPES.map((w) => ({
  value: w,
  label: WORKPLACE_TYPE_LABELS[w],
}));
const EMPLOYMENT_OPTIONS: MultiSelectOption[] = EMPLOYMENT_TYPES.map((t) => ({
  value: t,
  label: EMPLOYMENT_TYPE_LABELS[t],
}));

export type FeedFilterValues = {
  q: string;
  role: string;
  workplace: string;
  employment: string;
  loc: string;
  salary: string;
  posted: string;
  score: string;
  sort: string;
};

const SALARY_OPTIONS = [
  ["100000", "$100k+"],
  ["150000", "$150k+"],
  ["200000", "$200k+"],
  ["250000", "$250k+"],
] as const;

const POSTED_OPTIONS = [
  ["1", "Past 24 hours"],
  ["3", "Past 3 days"],
  ["7", "Past week"],
  ["14", "Past 2 weeks"],
  ["30", "Past month"],
] as const;

const SCORE_OPTIONS = [
  ["50", "50+"],
  ["70", "70+"],
  ["85", "85+"],
] as const;

const SORT_OPTIONS = [
  ["best", "Best match"],
  ["newest", "Newest"],
  ["salary", "Salary"],
  ["score", "Score"],
] as const;

const labelCls = "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5";
const selectCls =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500 appearance-none cursor-pointer";

export default function FeedFilters({
  values,
  locationOptions,
}: {
  values: FeedFilterValues;
  locationOptions: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(values.q);

  useEffect(() => setQ(values.q), [values.q]);

  function apply(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Any filter change resets to the first page of results.
    if (!("page" in patch)) params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/feed?${qs}` : "/feed");
  }

  const activeCount = [
    values.q,
    values.role,
    values.workplace,
    values.employment,
    values.loc,
    values.salary,
    values.posted,
    values.score,
  ].filter(Boolean).length;

  return (
    <div className="relative z-30 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="col-span-1 md:col-span-2 lg:col-span-1">
          <span className={labelCls}><Search size={12} /> Search</span>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply({ q });
            }}
            className="relative"
          >
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => q !== values.q && apply({ q })}
              placeholder="Title or company…"
              className={cn(selectCls, "pr-10")}
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </form>
        </div>

        <div>
          <span className={labelCls}><MapPin size={12} /> Location</span>
          <MultiSelect
            selected={csv(values.loc)}
            options={locationOptions.map((o) => ({ value: o, label: o }))}
            placeholder="Any location"
            searchable
            allowCustom
            onChange={(next) => apply({ loc: next.join(",") })}
          />
        </div>

        <div>
          <span className={labelCls}><Briefcase size={12} /> Role</span>
          <MultiSelect
            selected={csv(values.role)}
            options={ROLE_OPTIONS}
            placeholder="Any role"
            onChange={(next) => apply({ role: next.join(",") })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        <div>
          <span className={labelCls}>Workplace</span>
          <MultiSelect
            selected={csv(values.workplace)}
            options={WORKPLACE_OPTIONS}
            placeholder="Any"
            onChange={(next) => apply({ workplace: next.join(",") })}
          />
        </div>

        <div>
          <span className={labelCls}>Job type</span>
          <MultiSelect
            selected={csv(values.employment)}
            options={EMPLOYMENT_OPTIONS}
            placeholder="Any"
            onChange={(next) => apply({ employment: next.join(",") })}
          />
        </div>

        <div>
          <span className={labelCls}><DollarSign size={12} /> Salary</span>
          <select
            value={values.salary}
            onChange={(e) => apply({ salary: e.target.value })}
            className={selectCls}
          >
            <option value="">Any</option>
            {SALARY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={labelCls}><Calendar size={12} /> Added</span>
          <select
            value={values.posted}
            onChange={(e) => apply({ posted: e.target.value })}
            className={selectCls}
          >
            <option value="">Any time</option>
            {POSTED_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={labelCls}><Star size={12} /> Min Score</span>
          <select
            value={values.score}
            onChange={(e) => apply({ score: e.target.value })}
            className={selectCls}
          >
            <option value="">Any</option>
            {SCORE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={labelCls}>Sort By</span>
          <select
            value={values.sort || "best"}
            onChange={(e) => apply({ sort: e.target.value === "best" ? "" : e.target.value })}
            className={selectCls}
          >
            {SORT_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-[11px] font-medium text-muted-foreground">
          Showing US-based roles only.
        </p>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() =>
              apply({
                q: "",
                role: "",
                workplace: "",
                employment: "",
                loc: "",
                salary: "",
                posted: "",
                score: "",
                sort: "",
              })
            }
            className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            <X size={14} />
            Clear filters ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}
