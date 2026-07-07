import type { RoleType } from "@/lib/types";
import { cn } from "@/lib/utils";

const colors: Record<RoleType, string> = {
  FDE: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  FE: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-sky-200 dark:border-sky-800",
  BE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  FS: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800",
  DATA: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800",
};

export default function RoleChip({ role }: { role: RoleType | null }) {
  if (!role) {
    return <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        colors[role]
      )}
    >
      {role}
    </span>
  );
}
