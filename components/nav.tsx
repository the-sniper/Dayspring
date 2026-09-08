"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  Bot,
  Rss,
  KanbanSquare,
  Send,
  Download,
  Building2,
  Settings,
  Users2,
  UserCircle,
  Gauge,
  PenSquare,
  Sunrise,
  Zap,
  Target,
} from "lucide-react";
import ThemeToggle from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: typeof LayoutDashboard };

const groups: { label: string; links: NavLink[] }[] = [
  {
    label: "Overview",
    links: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/company", label: "Company", icon: Bot },
      { href: "/company/studio", label: "Content Studio", icon: PenSquare },
    ],
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
      { href: "/reach", label: "Reach", icon: Target },
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
  const reduce = useReducedMotion();

  async function handleSignOut() {
    await signOut();
    router.push("/signin");
  }

  const displayName = me?.name || me?.email?.split("@")[0] || "Account";

  const activeHref = groups
    .flatMap((g) => g.links.map((l) => l.href))
    .filter((href) =>
      href === "/" ? pathname === "/" : pathname.startsWith(href),
    )
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="sticky top-2.5 flex h-[calc(100dvh-1.25rem)] w-[4.75rem] shrink-0 flex-col overflow-hidden rounded-[1.75rem] bg-ink text-[#f4f0ea] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.55)] sm:top-3 sm:h-[calc(100dvh-1.5rem)] sm:w-[15rem] lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-[16.25rem]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_20%_0%,rgba(245,158,11,0.18),transparent_55%)]" />
      <div className="relative flex h-full flex-col px-3.5 py-5">
        <Link href="/" className="group mb-7 flex items-center gap-3 px-2">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-[1rem] bg-gradient-to-br from-brand-400 to-brand-700 text-white transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.04] group-hover:rotate-2">
            <Sunrise size={20} strokeWidth={2.2} />
            <span className="pointer-events-none absolute inset-px rounded-[0.9rem] ring-1 ring-inset ring-white/30" />
          </div>
          <div className="min-w-0 leading-none max-sm:hidden">
            <span className="font-display text-[1.4rem] font-semibold tracking-tight text-[#f7f3ec]">
              Dayspring
            </span>
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f7f3ec]/55">
              warmer, not more.
            </p>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto pr-0.5">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#f7f3ec]/35 max-sm:hidden">
                {group.label}
              </p>
              {group.links.map((l) => {
                const Icon = l.icon;
                const isActive = l.href === activeHref;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors duration-200 max-sm:justify-center max-sm:px-0",
                      isActive ? "text-ink" : "text-[#f7f3ec]/62 hover:text-[#f7f3ec]",
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId={reduce ? undefined : "nav-active"}
                        className="absolute inset-0 rounded-xl bg-brand-500"
                        transition={{ type: "spring", stiffness: 480, damping: 34 }}
                      />
                    )}
                    {!isActive && (
                      <span className="absolute inset-0 rounded-xl transition-colors duration-200 group-hover:bg-white/[0.06]" />
                    )}
                    <Icon
                      size={16}
                      strokeWidth={isActive ? 2.25 : 1.75}
                      className="relative z-10"
                    />
                    <span className="relative z-10 max-sm:hidden">{l.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4">
          {me && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 max-sm:hidden">
              <p className="truncate text-sm font-bold text-[#f7f3ec]">{displayName}</p>
              {me.email && (
                <p className="truncate text-[11px] font-medium text-[#f7f3ec]/45">{me.email}</p>
              )}
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="mt-2 text-[11px] font-bold uppercase tracking-wider text-[#f7f3ec]/45 transition-colors hover:text-[#f7f3ec]"
              >
                Sign out
              </button>
            </div>
          )}
          <ThemeToggle inverse />
        </div>
      </div>
    </aside>
  );
}
