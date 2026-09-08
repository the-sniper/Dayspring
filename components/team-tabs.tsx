"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "directory", label: "Agent Directory" },
  { id: "chart", label: "Command Chart" },
] as const;

export default function TeamTabs() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "directory";

  return (
    <div className="bezel mb-8">
      <div className="bezel-core flex items-center gap-1 overflow-x-auto p-1.5" role="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/company/team?tab=${tab.id}`}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "flex shrink-0 items-center rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                isActive
                  ? "bg-ink text-[#f7f3ec] dark:bg-brand-500 dark:text-brand-950"
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
