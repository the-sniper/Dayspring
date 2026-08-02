import Link from "next/link";
import { localAvatar } from "@/lib/orchestra/avatars";
import { directReports, type Employee } from "@/lib/orchestra/registry";
import { cn } from "@/lib/utils";
import EmployeeAvatar from "@/components/employee-avatar";
import { Sunrise } from "lucide-react";

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
        "group relative flex w-[9.5rem] flex-col items-center rounded-2xl border px-2 py-4 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/70 hover:shadow-lg active:scale-95",
        planned
          ? "border-dashed border-border/70 bg-secondary/10 opacity-60"
          : "border-border/80 bg-card/90 backdrop-blur-md",
      )}
    >
      <div className="relative mb-3 flex justify-center">
        <EmployeeAvatar
          name={e.name}
          avatar={localAvatar(e)}
          avatarFocus={e.avatarFocus}
          avatarZoom={e.avatarZoom}
          muted={planned}
          className="h-20 w-20 ring-4 ring-background/50 transition-all duration-300 group-hover:scale-105 group-hover:ring-brand-400/20"
        />
        {!planned && e.modelRole !== "code" && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-card z-10",
              isWorking ? "animate-pulse bg-emerald-400" : "bg-stone-400",
            )}
          />
        )}
      </div>
      <span className="text-[12px] font-bold leading-tight tracking-tight text-foreground">
        {e.name}
      </span>
      <span className="mt-1 line-clamp-2 text-[10px] font-medium leading-normal text-muted-foreground/70 px-1">
        {e.title}
      </span>
    </Link>
  );
}

function Branch({ e, working }: { e: Employee; working: Set<string> }) {
  const kids = directReports(e.id);
  return (
    <div className="flex flex-col items-center">
      <div className="relative group/node">
        {/* Connection anchor point */}
        <div className="absolute -top-6 left-1/2 h-6 w-px bg-gradient-to-b from-transparent to-border/40" />
        <Node e={e} working={working} />
      </div>
      
      {kids.length > 0 && (
        <div className="flex flex-col items-center">
          {/* Vertical stem from parent */}
          <div className="h-10 w-px bg-gradient-to-b from-brand-400/40 to-border/20" />
          
          {/* Kids cluster - elegant surface grouping */}
          <div className="relative flex max-w-full flex-wrap items-start justify-center gap-10 rounded-[3rem] border border-border/30 bg-secondary/[0.04] p-10 shadow-inner shadow-black/[0.01]">
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
  const roots = directReports(null); // reports to the CEO
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-card p-6 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.6)] sm:p-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.25),transparent_80%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.18),transparent_80%)]" />
      
      <div className="relative mb-16 flex flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-brand-600 dark:text-brand-400">
          Orchestration Command
        </div>
        <h3 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          The Living Chart
        </h3>
        <p className="mt-4 max-w-lg text-base text-muted-foreground/80 leading-relaxed">
          Monitor your autonomous workforce in real-time. This dynamic map tracks
          reporting lines, operational states, and agent hierarchy.
        </p>
      </div>

      <div className="flex flex-col items-center pb-12">
        <div className="relative group">
          <div className="absolute -inset-2 rounded-[2rem] bg-brand-500/10 blur-xl opacity-30 transition-opacity group-hover:opacity-60" />
          <div className="relative flex min-w-64 flex-col items-center gap-2.5 rounded-[2rem] border border-brand-500/20 bg-card/80 backdrop-blur-md px-6 py-8 text-center shadow-lg transition-all duration-500 hover:scale-[1.01] active:scale-95">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-brand-500/20">
              <Sunrise className="text-white" size={28} strokeWidth={2.5} />
            </div>
            <div className="mt-2">
              <span className="font-display text-xl font-bold text-foreground">
                {userName}
              </span>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
                Architect & Visionary
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1.5 rounded-full bg-emerald-500/5 px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border border-emerald-500/10">
              <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
              Command Active
            </div>
          </div>
        </div>
        {roots.map((r) => (
          <div key={r.id} className="flex w-full flex-col items-center">
            <div className="h-10 w-px bg-gradient-to-b from-brand-400/40 to-border/40" />
            <Branch e={r} working={working} />
          </div>
        ))}
      </div>
    </div>
  );
}
