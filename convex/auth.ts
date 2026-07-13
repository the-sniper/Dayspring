import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

// Two ways in: email/password (with a display name captured at signup) and
// Google OAuth. Google needs AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET set on the
// Convex deployment (a "Web application" OAuth client with the deployment's
// .convex.site callback URL — see README/settings).
//
// New accounts get no data at signup — the /onboarding screen (gated by
// components/onboarding-gate.tsx) collects preferences and seeds companies
// + schedules the first pull via api.onboarding.complete.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = params.email as string;
        return {
          email,
          // Signup form sends a display name; fall back to the mailbox part.
          name: (params.name as string) || email.split("@")[0],
        };
      },
    }),
    Google,
  ],
});
