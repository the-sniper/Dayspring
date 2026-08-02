"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users2, GitGraph } from "lucide-react";
import { motion } from "framer-motion";

export default function TeamTabs() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "directory";

  const tabs = [
    { id: "directory", label: "Agent Directory", icon: Users2, description: "Manage models & memory" },
    { id: "chart", label: "Command Chart", icon: GitGraph, description: "Real-time orchestration map" },
  ];

  return (
    <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-1">
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/company/team?tab=${tab.id}`}
              className={cn(
                "group relative flex flex-col gap-0.5 px-6 py-4 transition-all duration-300",
                isActive ? "opacity-100" : "opacity-60 hover:opacity-100"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300",
                  isActive 
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20 rotate-0" 
                    : "bg-secondary text-muted-foreground group-hover:bg-secondary/80 -rotate-3"
                )}>
                  <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <div className="flex flex-col">
                  <span className={cn(
                    "text-sm font-bold tracking-tight transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}>
                    {tab.label}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground/60 hidden md:block">
                    {tab.description}
                  </span>
                </div>
              </div>
              {isActive && (
                <motion.div 
                  layoutId="active-tab-indicator"
                  className="absolute inset-x-0 -bottom-[5px] h-1 rounded-t-full bg-brand-500 shadow-[0_-2px_10px_rgba(245,158,11,0.4)]" 
                />
              )}
            </Link>
          );
        })}
      </div>
      
      <div className="hidden lg:flex items-center gap-6 px-6 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/50" />
          Live Telemetry
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-brand-500/50" />
          Neural Active
        </div>
      </div>
    </div>
  );
}
