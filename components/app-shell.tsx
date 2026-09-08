"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Nav from "@/components/nav";

// Full chrome everywhere except /signin and /onboarding.
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/signin" || pathname === "/onboarding") return <>{children}</>;

  return (
    <div className="min-h-[100dvh] p-2.5 sm:p-3 lg:p-4">
      <div className="flex min-h-[calc(100dvh-1.25rem)] gap-2.5 sm:min-h-[calc(100dvh-1.5rem)] sm:gap-3 lg:min-h-[calc(100dvh-2rem)]">
        <Nav />
        <div className="bezel min-w-0 flex-1">
          <main className="bezel-core relative min-h-full overflow-hidden px-5 py-7 sm:px-8 sm:py-9 lg:px-12 lg:py-11">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(60%_80%_at_80%_0%,rgba(245,158,11,0.14),transparent_70%)]"
              aria-hidden
            />
            <div className="relative">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
