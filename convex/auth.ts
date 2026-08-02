import Google from "@auth/core/providers/google";
// Named export, not default — the upstream docs show a default import, which is
// a newer major than the 0.0.94 pinned here.
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";

// Three ways in: email/password (with a display name captured at signup),
// Google OAuth, and a shared-secret provider used only by CLI scripts.
//
// Google needs AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET set on the Convex deployment
// (a "Web application" OAuth client with the deployment's .convex.site callback
// URL — see README/settings).
//
// New accounts get no data at signup — the /onboarding screen (gated by
// components/onboarding-gate.tsx) collects preferences and seeds companies
// + schedules the first pull via api.onboarding.complete.

// Length-independent equality so a wrong secret can't be narrowed by timing.
// The Convex runtime has no node:crypto timingSafeEqual, so this is by hand.
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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

    // CLI sign-in for background scripts (scripts/*.ts, the MCP server, the
    // launchd daily run). It exists because those scripts previously signed in
    // with the Password provider, which does not work for an account created
    // through Google — and worse, signing UP with a password using the same
    // address would silently create a SECOND user (this Password provider has
    // no email verification, so Convex Auth treats it as untrusted and will not
    // link it to the OAuth account). A script authenticated as that second user
    // sees an empty database and reports "0 rows" as if it succeeded.
    //
    // So instead: authenticate against an existing user by email, gated by a
    // secret held on the deployment. It grants no new capability — it is
    // equivalent to knowing the account password, which is exactly what the old
    // path required. Set it with:
    //   npx convex env set DAYSPRING_CLI_SECRET "$(openssl rand -hex 32)"
    // Unset on the deployment, this provider refuses every request.
    ConvexCredentials<DataModel>({
      id: "cli",
      authorize: async (credentials, ctx) => {
        const expected = process.env.DAYSPRING_CLI_SECRET;
        if (!expected) return null; // disabled unless explicitly configured
        const secret = credentials.secret;
        const email = credentials.email;
        if (typeof secret !== "string" || typeof email !== "string") return null;
        if (!secretsMatch(secret, expected)) return null;

        // An explicit id wins, for the duplicate-account case below.
        const pinned = credentials.userId;
        if (typeof pinned === "string" && pinned) {
          const [found] = await ctx.runQuery(internal.users.summarize, {
            ids: [pinned as Id<"users">],
          });
          if (!found) return null;
          return { userId: pinned as Id<"users"> };
        }

        // Never creates a user. If the address has no account, sign-in fails —
        // which is the point: this attaches scripts to an EXISTING account
        // rather than quietly making a new one.
        const ids = await ctx.runQuery(internal.users.idsByEmail, {
          email: email.toLowerCase().trim(),
        });
        if (ids.length === 0) return null;
        if (ids.length === 1) return { userId: ids[0] };

        // More than one account on the same email — an OAuth sign-in and an
        // unverified password signup don't link, so a stray signup leaves a
        // duplicate behind. Picking one here would be the worst possible
        // behaviour: scripts would run happily against whichever account we
        // guessed and report "0 rows" if it was the empty one. So refuse, and
        // hand back exactly the information needed to choose.
        const summary = await ctx.runQuery(internal.users.summarize, { ids });
        const lines = summary.map((u) => {
          const counts = Object.entries(u.counts)
            .map(([t, n]) => `${n}${n >= 200 ? "+" : ""} ${t}`)
            .join(", ");
          return `  ${u.id}  ${counts || "(no data)"}`;
        });
        throw new Error(
          `${ids.length} accounts share the email ${email}, so CLI sign-in can't tell which is yours:\n` +
            `${lines.join("\n")}\n` +
            "Pick the one with your data and pin it in .env.local:\n" +
            `  DAYSPRING_CLI_USER_ID=${summary.find((u) => Object.keys(u.counts).length > 0)?.id ?? ids[0]}\n` +
            "The empty one is a duplicate from a password signup that Convex Auth couldn't link " +
            "to your Google account; it's safe to delete in the Convex dashboard once you've " +
            "confirmed which is which.",
        );
      },
    }),
  ],
});
