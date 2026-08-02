// Signs CLI scripts into Convex as a real user so requireUser() passes.
//
// Two routes in, checked in this order:
//
//  1. DAYSPRING_CLI_EMAIL + DAYSPRING_CLI_SECRET — the "cli" credentials
//     provider (convex/auth.ts). Works for ANY existing account regardless of
//     how it was created, which matters because a Google-OAuth account has no
//     password to hand over. Use this one.
//  2. DAYSPRING_CLI_EMAIL + DAYSPRING_CLI_PASSWORD — the original path, only
//     valid for accounts that were created with email/password.
//
// Do NOT "fix" a Google account by signing up with a password on the same
// address: this app's Password provider has no email verification, so Convex
// Auth treats it as untrusted and creates a SECOND user rather than linking.
// Scripts would then run against an empty account and report zero rows as
// though they had succeeded.
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { setCliAuthToken } from "@/lib/convex/server";

const SETUP_HINT =
  "Background runs need a signed-in user. Set DAYSPRING_CLI_EMAIL to your account's email, then either " +
  "DAYSPRING_CLI_SECRET (recommended, works with Google sign-in — also run: " +
  '`npx convex env set DAYSPRING_CLI_SECRET "<same value>"`) or DAYSPRING_CLI_PASSWORD ' +
  "(only if you created the account with email/password). Locally these go in .env.local; " +
  "for the hosted cron route, in your host's env vars.";

export async function signInAsOperator(): Promise<string> {
  const email = process.env.DAYSPRING_CLI_EMAIL?.trim();
  const secret = process.env.DAYSPRING_CLI_SECRET;
  const password = process.env.DAYSPRING_CLI_PASSWORD;
  if (!email || (!secret && !password)) throw new Error(SETUP_HINT);

  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
  const client = new ConvexHttpClient(url);

  // Convex Auth THROWS on a failed sign-in rather than returning empty tokens,
  // so every branch below has to catch. Checking the return value alone leaves
  // the caller staring at a raw "Uncaught Error: InvalidSecret" stack trace
  // through node_modules, which says nothing about what to actually change.
  const attempt = async (args: Record<string, unknown>, onFail: (cause: string) => string) => {
    let result: { tokens?: { token: string } | null };
    try {
      result = (await client.action(api.auth.signIn, args as never)) as typeof result;
    } catch (err) {
      throw new Error(onFail(err instanceof Error ? err.message : String(err)));
    }
    const token = result.tokens?.token;
    if (!token) throw new Error(onFail("sign-in returned no token"));
    return token;
  };

  if (secret) {
    // Optional, and only needed when one email has more than one account —
    // the provider's error tells you the id to put here.
    const userId = process.env.DAYSPRING_CLI_USER_ID?.trim() || undefined;
    return attempt(
      { provider: "cli", params: { email, secret, ...(userId ? { userId } : {}) } },
      (cause) =>
        `CLI sign-in failed (${cause.split("\n")[0]}).\n` +
        "Three things to check, in order:\n" +
        "  1. The deployment has the secret: `npx convex env get DAYSPRING_CLI_SECRET`\n" +
        "  2. It matches DAYSPRING_CLI_SECRET in .env.local exactly\n" +
        `  3. DAYSPRING_CLI_EMAIL (${email}) is the email on your account — this provider ` +
        "never creates accounts, so an unknown address fails by design.",
    );
  }

  return attempt(
    { provider: "password", params: { email, password, flow: "signIn" } },
    (cause) => {
      const invalid = /InvalidSecret|InvalidAccountId/i.test(cause);
      return invalid
        ? `No password account exists for ${email} (${cause.split("\n")[0]}).\n` +
          "If you signed in with Google, this account has no password at all — set " +
          "DAYSPRING_CLI_SECRET instead of DAYSPRING_CLI_PASSWORD, and set the same value on " +
          'the deployment with `npx convex env set DAYSPRING_CLI_SECRET "<value>"`.\n' +
          "Do NOT sign up with a password on this address to create one: this app's Password " +
          "provider is unverified, so Convex Auth would make a SECOND user and every script " +
          "would then run against an empty account."
        : `CLI sign-in failed (${cause.split("\n")[0]}). Check DAYSPRING_CLI_EMAIL and DAYSPRING_CLI_PASSWORD.`;
    },
  );
}

export async function ensureCliAuth(): Promise<void> {
  setCliAuthToken(await signInAsOperator());
}
