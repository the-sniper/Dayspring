import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type Tone = "default" | "accent" | "success" | "warn" | "danger" | "quiet";

const PANEL_TONE: Record<Tone, string> = {
  default: "",
  accent: "bg-brand-500/[0.07]",
  success: "bg-emerald-500/[0.06]",
  warn: "bg-amber-500/[0.06]",
  danger: "bg-rose-500/[0.07]",
  quiet: "bg-transparent",
};

export function Panel({
  tone = "default",
  className,
  children,
  flush,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <div className="bezel">
      <div
        className={cn(
          "bezel-core",
          PANEL_TONE[tone],
          !flush && "p-5 sm:p-6",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  hint,
  icon,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-brand-500/25 bg-brand-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-800 dark:text-brand-300">
            {icon}
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-[1.35rem] font-semibold tracking-tight text-foreground sm:text-xl">
          {title}
        </h2>
        {hint && (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

const CHIP_TONE: Record<Tone, string> = {
  default: "bg-secondary text-muted-foreground",
  accent: "bg-brand-500/12 text-brand-800 dark:text-brand-300",
  success: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-400",
  warn: "bg-amber-500/12 text-amber-800 dark:text-amber-400",
  danger: "bg-rose-500/12 text-rose-800 dark:text-rose-400",
  quiet: "bg-secondary/60 text-muted-foreground/70",
};

export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        CHIP_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (["verified", "confirmed", "approved", "posted", "complete", "done"].includes(status))
    return "success";
  if (["blocked", "needs_work", "drafts_ready", "plan_ready", "hooks_ready"].includes(status))
    return "warn";
  if (["failed", "escalated", "refuted", "rejected"].includes(status)) return "danger";
  if (["in_progress", "delivered", "researching", "drafting", "deep_research"].includes(status))
    return "accent";
  return "default";
}

export const ROLE_TONE: Record<string, string> = {
  atlas: "bg-brand-500/10 text-brand-700 dark:text-brand-400",
  radar: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  sentinel: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
  compass: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  quill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  delve: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  spark: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  hone: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  easel: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
  pulse: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  herald: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  forge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  probe: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
};

export const PLATFORM_TONE: Record<string, string> = {
  linkedin: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  x: "bg-stone-500/10 text-stone-700 dark:text-stone-300",
  reddit: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
};

export function Meter({
  value,
  max,
  tone = "accent",
  className,
}: {
  value: number;
  max: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill =
    tone === "danger"
      ? "bg-rose-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "success"
          ? "bg-emerald-500"
          : "bg-brand-500";
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]",
          fill,
        )}
        style={{ width: `${Math.max(pct, 2)}%` }}
      />
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  meter,
  action,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: Tone;
  meter?: { value: number; max: number; tone?: Tone };
  action?: ReactNode;
}) {
  const valueColor =
    tone === "danger"
      ? "text-rose-500"
      : tone === "warn"
        ? "text-amber-500"
        : tone === "success"
          ? "text-emerald-500"
          : "text-foreground";
  return (
    <div className="bezel h-full">
      <div className="bezel-core relative flex h-full flex-col gap-2.5 overflow-hidden p-5">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent" />
        <div className="flex items-start justify-between gap-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          {action}
        </div>
        <p
          className={cn(
            "font-display text-[2rem] font-semibold leading-none tracking-tight sm:text-[2.35rem]",
            valueColor,
          )}
        >
          {value}
        </p>
        {meter && <Meter value={meter.value} max={meter.max} tone={meter.tone ?? tone} />}
        {sub && (
          <div className="mt-auto text-[11px] font-medium leading-snug text-muted-foreground">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="bezel">
      <div className="bezel-core flex flex-col items-center gap-2 px-6 py-14 text-center">
        {icon && <div className="mb-1 text-muted-foreground/35">{icon}</div>}
        <p className="font-display text-lg font-semibold text-foreground">{title}</p>
        {hint && (
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{hint}</p>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export type TabDef = {
  id: string;
  label: string;
  count?: number;
  alert?: boolean;
};

export function Tabs({
  tabs,
  active,
  hrefFor,
  className,
}: {
  tabs: TabDef[];
  active: string;
  hrefFor: (id: string) => string;
  className?: string;
}) {
  return (
    <div className={cn("bezel", className)}>
      <div className="bezel-core flex items-center gap-1 overflow-x-auto p-1.5" role="tablist">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <Link
              key={t.id}
              href={hrefFor(t.id)}
              role="tab"
              aria-selected={on}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                on
                  ? "bg-ink text-[#f7f3ec] dark:bg-brand-500 dark:text-brand-950"
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
              )}
            >
              {t.label}
              {t.count ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                    on
                      ? "bg-white/15 text-[#f7f3ec] dark:bg-brand-950/15 dark:text-brand-950"
                      : t.alert
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-secondary text-muted-foreground",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function PrimaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-12 items-center gap-2.5 rounded-full bg-brand-500 pl-5 pr-2 text-sm font-bold text-brand-950 shadow-[0_14px_36px_-16px_rgba(245,158,11,0.85)] transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-brand-400 active:scale-[0.98]",
        className,
      )}
    >
      <span className="flex items-center gap-2">{children}</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-950/10 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:scale-105">
        <span aria-hidden className="text-sm leading-none">
          →
        </span>
      </span>
    </Link>
  );
}

export function QuietLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-12 items-center gap-1.5 rounded-full border border-border/80 bg-card/40 px-4 text-xs font-semibold text-muted-foreground transition-colors duration-300 hover:border-brand-500/35 hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}
