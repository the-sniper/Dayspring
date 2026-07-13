"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import OnboardingBootstrap from "@/components/onboarding-bootstrap";

// Reactive client for the hybrid live-update spots (apply session, pull/score
// progress) plus the auth actions (signIn/signOut). Server rendering still
// fetches via lib/convex/server.ts with the request's token.
const client = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={client}>
      <OnboardingBootstrap />
      {children}
    </ConvexAuthNextjsProvider>
  );
}
