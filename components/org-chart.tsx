import Link from "next/link";
import { localAvatar } from "@/lib/orchestra/avatars";
import { directReports, type Employee } from "@/lib/orchestra/registry";
import { cn } from "@/lib/utils";
import EmployeeAvatar from "@/components/employee-avatar";
import { Sunrise } from "lucide-react";
import { Panel } from "@/components/orchestra-ui";

// The org chart, rendered straight from the registry's managerId edges —
// server component, zero client JS. Compact nodes + wrapping branch rows so
// the whole tree fits the container width (no horizontal scroll).

function Node({ e, working }: { e: Employee; working: Set<string> }) {
  const planned = e.status === "planned";
  const isWorking = working.has(e.id);
  return (
    <Link
      href={`/company/team/${e.id}`}
      className={cn(
        "group flex w-[9.5rem] flex-col items-center rounded-[1.2rem] border px-2 py-4 text-center transition-colors hover:border-brand-500/40 active:scale-[0.98]",
        planned
          ? "border-dashed border-border/70 bg-secondary/10 opacity-60"
          : "surface-lift border-border/55",
      )}
    >
      <div className="relative mb-3 flex justify-center">
        <EmployeeAvatar
          name={e.name}
          avatar={localAvatar(e)}
          avatarFocus={e.avatarFocus}
          avatarZoom={e.avatarZoom}
          muted={planned}
          className="h-16 w-16 ring-2 ring-background"
        />
        {!planned && e.modelRole !== "code" && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 z-10 h-3 w-3 rounded-full border-2 border-card",
              isWorking ? "bg-emerald-500" : "bg-stone-400",
            )}
            title={isWorking ? "Working now" : "On bench"}
          />
        )}
      </div>
      <span className="text-[12px] font-bold leading-tight tracking-tight text-foreground">
        {e.name}
      </span>
      <span className="mt-1 line-clamp-2 px-1 text-[10px] font-medium leading-normal text-muted-foreground">
        {e.title}
      </span>
    </Link>
  );
}

function Branch({ e, working }: { e: Employee; working: Set<string> }) {
  const kids = directReports(e.id);
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div className="absolute -top-6 left-1/2 h-6 w-px bg-border/50" />
        <Node e={e} working={working} />
      </div>

      {kids.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="h-8 w-px bg-border/50" />
          <div className="relative flex max-w-full flex-wrap items-start justify-center gap-8 rounded-2xl border border-border/40 bg-secondary/20 p-6">
            {kids.map((k) => (
              <Branch key={k.id} e={k} working={working} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgChart({
  working,
  userName = "Founder",
}: {
  working: Set<string>;
  userName?: string;
}) {
  const roots = directReports(null);
  return (
    <Panel className="overflow-hidden p-6 sm:p-10" flush>
      <div className="mb-10 max-w-xl">
        <h3 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Who reports to whom
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Reporting lines from the registry. Green means a task is in flight
          today; stone means on the bench between runs.
        </p>
      </div>

      <div className="flex flex-col items-center pb-4">
        <div className="flex min-w-56 flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card px-6 py-6 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-sm">
            <Sunrise className="text-white" size={24} strokeWidth={2.5} />
          </div>
          <div className="mt-1">
            <span className="font-display text-lg font-bold text-foreground">
              {userName}
            </span>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              You
            </p>
          </div>
        </div>
        {roots.map((r) => (
          <div key={r.id} className="flex w-full flex-col items-center">
            <div className="h-8 w-px bg-border/50" />
            <Branch e={r} working={working} />
          </div>
        ))}
      </div>
    </Panel>
  );
}
