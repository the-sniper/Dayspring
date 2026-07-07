"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Pagination({
  total,
  pageSize,
  currentPage,
}: {
  total: number;
  pageSize: number;
  currentPage: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) return null;

  function createPageUrl(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) params.delete("page");
    else params.set("page", String(page));
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between border-t border-border bg-secondary/10 px-6 py-4">
      <div className="flex flex-1 justify-between sm:hidden">
        <Link
          href={currentPage > 1 ? createPageUrl(currentPage - 1) : "#"}
          className={cn(
            "relative inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground",
            currentPage <= 1 && "pointer-events-none opacity-50"
          )}
        >
          Previous
        </Link>
        <Link
          href={currentPage < totalPages ? createPageUrl(currentPage + 1) : "#"}
          className={cn(
            "relative ml-3 inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground",
            currentPage >= totalPages && "pointer-events-none opacity-50"
          )}
        >
          Next
        </Link>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground">{(currentPage - 1) * pageSize + 1}</span> to{" "}
            <span className="font-bold text-foreground">{Math.min(currentPage * pageSize, total)}</span> of{" "}
            <span className="font-bold text-foreground">{total}</span> results
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-xl shadow-sm" aria-label="Pagination">
            <Link
              href={currentPage > 1 ? createPageUrl(currentPage - 1) : "#"}
              className={cn(
                "relative inline-flex items-center rounded-l-xl border border-border bg-card px-2 py-2 text-muted-foreground hover:bg-secondary focus:z-20 focus:outline-offset-0 transition-colors",
                currentPage <= 1 && "pointer-events-none opacity-50"
              )}
            >
              <span className="sr-only">Previous</span>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            
            {/* Page numbers could be added here for more complex pagination */}
            <div className="relative inline-flex items-center border border-border bg-card px-4 py-2 text-sm font-bold text-foreground focus:z-20">
              Page {currentPage} of {totalPages}
            </div>

            <Link
              href={currentPage < totalPages ? createPageUrl(currentPage + 1) : "#"}
              className={cn(
                "relative inline-flex items-center rounded-r-xl border border-border bg-card px-2 py-2 text-muted-foreground hover:bg-secondary focus:z-20 focus:outline-offset-0 transition-colors",
                currentPage >= totalPages && "pointer-events-none opacity-50"
              )}
            >
              <span className="sr-only">Next</span>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
