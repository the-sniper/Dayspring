"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Nav from "@/components/nav";

// Full chrome everywhere except /signin and /onboarding, which are
// standalone full-screen flows.
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/signin" || pathname === "/onboarding") return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Nav />
      <main className="min-w-0 flex-1 px-8 py-10 lg:px-12 lg:py-14">{children}</main>
    </div>
  );
}
