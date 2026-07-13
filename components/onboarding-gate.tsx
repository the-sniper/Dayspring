"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

// Signed-in users who haven't finished onboarding get routed to /onboarding
// — new signups and legacy accounts alike. Once complete, /onboarding itself
// bounces back to the app.
export default function OnboardingGate() {
  const { isAuthenticated } = useConvexAuth();
  const pathname = usePathname();
  const router = useRouter();
  const status = useQuery(
    api.onboarding.status,
    isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (!isAuthenticated || !status) return;
    if (!status.completed && pathname !== "/onboarding" && pathname !== "/signin") {
      router.replace("/onboarding");
    } else if (status.completed && pathname === "/onboarding") {
      router.replace("/feed");
    }
  }, [isAuthenticated, status, pathname, router]);

  return null;
}
