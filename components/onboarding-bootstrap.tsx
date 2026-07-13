"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";

// New (and legacy) accounts: seed the company catalog and schedule a background
// ATS pull when Companies or Discovery would otherwise be empty.
export default function OnboardingBootstrap() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const status = useQuery(
    api.users.onboardingStatus,
    isAuthenticated ? {} : "skip",
  );
  const ensureOnboarded = useMutation(api.auth.ensureOnboarded);
  const ran = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || status === undefined) return;
    if (!status?.needsBootstrap || ran.current) return;
    ran.current = true;
    void ensureOnboarded({});
  }, [isLoading, isAuthenticated, status, ensureOnboarded]);

  return null;
}
