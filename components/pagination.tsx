"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Pagination as HeroPagination } from "@heroui/react";

function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("ellipsis");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export default function Pagination({
  total,
  pageSize,
  currentPage,
  pageSizes,
  pageSizeParam = "per",
}: {
  total: number;
  pageSize: number;
  currentPage: number;
  pageSizes?: readonly number[];
  pageSizeParam?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) return null;

  const showNav = totalPages > 1;
  const showSizeSelect =
    pageSizes !== undefined &&
    pageSizes.length > 0 &&
    total > Math.min(...pageSizes);

  if (!showNav && !showSizeSelect) return null;

  function pushParams(params: URLSearchParams) {
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function go(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) params.delete("page");
    else params.set("page", String(page));
    pushParams(params);
  }

  function changePageSize(size: number) {
    const params = new URLSearchParams(searchParams.toString());
    const defaultSize = pageSizes?.[0];
    if (defaultSize !== undefined && size === defaultSize) params.delete(pageSizeParam);
    else params.set(pageSizeParam, String(size));
    params.delete("page");
    pushParams(params);
  }

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);
  const pages = pageWindow(currentPage, totalPages);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-6 py-4 sm:flex-row">
      <HeroPagination.Summary>
        Showing <span className="font-semibold text-foreground">{from}</span>–
        <span className="font-semibold text-foreground">{to}</span> of{" "}
        <span className="font-semibold text-foreground">{total}</span>
      </HeroPagination.Summary>

      <div className="flex flex-wrap items-center justify-center gap-4">
        {showSizeSelect && (
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="font-bold uppercase tracking-widest">Per page</span>
            <select
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              className="cursor-pointer rounded-lg border border-border bg-secondary/30 px-2 py-1 text-xs font-bold text-foreground transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}

        {showNav && (
          <HeroPagination>
            <HeroPagination.Content>
              <HeroPagination.Item>
                <HeroPagination.Previous
                  isDisabled={currentPage <= 1}
                  onPress={() => go(currentPage - 1)}
                >
                  <HeroPagination.PreviousIcon />
                </HeroPagination.Previous>
              </HeroPagination.Item>

              {pages.map((p, i) =>
                p === "ellipsis" ? (
                  <HeroPagination.Item key={`e-${i}`}>
                    <HeroPagination.Ellipsis />
                  </HeroPagination.Item>
                ) : (
                  <HeroPagination.Item key={p}>
                    <HeroPagination.Link
                      isActive={p === currentPage}
                      onPress={() => go(p)}
                    >
                      {p}
                    </HeroPagination.Link>
                  </HeroPagination.Item>
                ),
              )}

              <HeroPagination.Item>
                <HeroPagination.Next
                  isDisabled={currentPage >= totalPages}
                  onPress={() => go(currentPage + 1)}
                >
                  <HeroPagination.NextIcon />
                </HeroPagination.Next>
              </HeroPagination.Item>
            </HeroPagination.Content>
          </HeroPagination>
        )}
      </div>
    </div>
  );
}
