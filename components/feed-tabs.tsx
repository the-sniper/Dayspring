"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

// The feed has two sources: company ATS boards (the table at /feed) and
// LinkedIn hiring posts (the cards at /feed/posts). Separate routes rather than
// a search param, so each side keeps its own filters and pagination state.
const TABS = [
  { href: "/feed", label: "Boards", icon: Layers },
  { href: "/feed/posts", label: "LinkedIn posts", icon: Megaphone },
];

export default function FeedTabs({ postCount }: { postCount?: number }) {
  const pathname = usePathname();

  return (
    <div
      role="tablist"
      aria-label="Feed source"
      className="mb-6 inline-flex items-center gap-1 rounded-xl border border-border bg-secondary/30 p-1"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/feed" ? pathname === "/feed" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon size={14} />
            {label}
            {href === "/feed/posts" && postCount !== undefined && postCount > 0 && (
              <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[9px] font-black tabular-nums text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                {postCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
