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
        "mb-9 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            {icon}
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">
              {eyebrow}
            </span>
          </div>
        )}
        <h1 className="font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <div className="mt-2.5 max-w-2xl text-sm font-medium text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </header>
  );
}
