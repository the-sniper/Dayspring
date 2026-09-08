import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-10 grid gap-8 border-b border-border/40 pb-10 lg:grid-cols-[minmax(0,1.35fr)_auto] lg:items-end",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/[0.09] px-3 py-1.5 text-brand-800 dark:text-brand-300">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
              {eyebrow}
            </span>
          </div>
        )}
        <h1 className="max-w-[11ch] font-display text-[clamp(2.75rem,6vw,4.25rem)] font-semibold leading-[0.95] tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <div className="mt-4 max-w-[36rem] text-[15px] font-medium leading-relaxed text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 lg:justify-end">
          {actions}
        </div>
      )}
    </header>
  );
}
