"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Rss,
  KanbanSquare,
  Send,
  Download,
  Building2,
  Settings,
  Users2,
  UserCircle,
  Sunrise
} from "lucide-react";
import ThemeToggle from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/feed", label: "Feed", icon: Rss },
  { href: "/board", label: "Board", icon: KanbanSquare },
  { href: "/outreach", label: "Outreach", icon: Send },
  { href: "/network", label: "Network", icon: Users2 },
  { href: "/import", label: "Import", icon: Download },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/profile", label: "Profile", icon: UserCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card px-4 py-8">
      <Link href="/" className="mb-10 flex items-center gap-3 px-3 group">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/20 group-hover:scale-105 transition-transform">
          <Sunrise size={24} strokeWidth={2.5} />
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">Dayspring</span>
      </Link>
      
      <nav className="flex flex-1 flex-col gap-1.5">
        {links.map((l) => {
          const Icon = l.icon;
          const isActive = pathname === l.href;
          
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-brand-50 text-brand-900 dark:bg-brand-950/30 dark:text-brand-300" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon 
                size={18} 
                className={cn(
                  "transition-colors",
                  isActive ? "text-brand-600 dark:text-brand-400" : "text-muted-foreground group-hover:text-foreground"
                )} 
              />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-4 pt-6">
        <ThemeToggle />
        <div className="px-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
            warmer, not more.
          </p>
        </div>
      </div>
    </aside>
  );
}
