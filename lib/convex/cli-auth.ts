// Signs CLI scripts into Convex as a real user so requireUser() passes.
// Set DAYSPRING_CLI_EMAIL + DAYSPRING_CLI_PASSWORD in .env.local (a normal
// account created via the /signin page).
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { setCliAuthToken } from "@/lib/convex/server";

// Exchange the operator credentials for a Convex auth token. Callers that own
// the whole process (CLI scripts) install it globally via ensureCliAuth; the
// hosted cron route instead scopes it to one call tree with runAsUser.
export async function signInAsOperator(): Promise<string> {
  const email = process.env.DAYSPRING_CLI_EMAIL?.trim();
  const password = process.env.DAYSPRING_CLI_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Background runs need a signed-in user — create an account at /signin, then set " +
        "DAYSPRING_CLI_EMAIL and DAYSPRING_CLI_PASSWORD (in .env.local locally, or " +
        "your host's env vars for the cron route).",
    );
  }
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");

  const client = new ConvexHttpClient(url);
  const result = (await client.action(api.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signIn" },
  })) as { tokens?: { token: string } | null };

  const token = result.tokens?.token;
  if (!token) {
    throw new Error(
      "CLI sign-in failed — check DAYSPRING_CLI_EMAIL / DAYSPRING_CLI_PASSWORD.",
    );
  }
  return token;
}

export async function ensureCliAuth(): Promise<void> {
  setCliAuthToken(await signInAsOperator());
}
