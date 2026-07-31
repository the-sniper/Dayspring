"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion } from "framer-motion";
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
  Gauge,
  Sunrise,
  Zap,
} from "lucide-react";
import ThemeToggle from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: typeof LayoutDashboard };

const groups: { label: string; links: NavLink[] }[] = [
  {
    label: "Overview",
    links: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Discover",
    links: [
      { href: "/feed", label: "Feed", icon: Rss },
      { href: "/companies", label: "Companies", icon: Building2 },
      { href: "/network", label: "Network", icon: Users2 },
    ],
  },
  {
    label: "Pipeline",
    links: [
      { href: "/board", label: "Board", icon: KanbanSquare },
      { href: "/apply", label: "Auto-Apply", icon: Zap },
      { href: "/outreach", label: "Outreach", icon: Send },
    ],
  },
  {
    label: "Workspace",
    links: [
      { href: "/match", label: "Resume Match", icon: Gauge },
      { href: "/import", label: "Import", icon: Download },
      { href: "/profile", label: "Profile", icon: UserCircle },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me);

  async function handleSignOut() {
    await signOut();
    router.push("/signin");
  }

  const displayName = me?.name || me?.email?.split("@")[0] || "Account";

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-surface/40 px-4 py-7 backdrop-blur-xl">
      <Link href="/" className="group mb-9 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/25 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
          <Sunrise size={22} strokeWidth={2.4} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-display text-[1.35rem] font-semibold tracking-tight text-foreground">
            Dayspring
          </span>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50">
              {group.label}
            </p>
            {group.links.map((l) => {
              const Icon = l.icon;
              const isActive =
                l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);

              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xl bg-accent ring-1 ring-inset ring-brand-500/20"
                      transition={{ type: "spring", stiffness: 500, damping: 36 }}
                    />
                  )}
                  {!isActive && (
                    <span className="absolute inset-0 rounded-xl bg-transparent transition-colors duration-200 group-hover:bg-secondary/70" />
                  )}
                  <Icon
                    size={18}
                    className={cn(
                      "relative z-10 transition-colors",
                      isActive
                        ? "text-brand-600 dark:text-brand-400"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  <span className="relative z-10">{l.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-4">
        {me && (
          <div className="px-2">
            <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
            {me.email && (
              <p className="truncate text-[11px] font-medium text-muted-foreground">{me.email}</p>
            )}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        )}
        <ThemeToggle />
        <p className="px-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/40">
          warmer, not more.
        </p>
      </div>
    </aside>
  );
}
