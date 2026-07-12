// Signs CLI scripts into Convex as a real user so requireUser() passes.
// Set DAYSPRING_CLI_EMAIL + DAYSPRING_CLI_PASSWORD in .env.local (a normal
// account created via the /signin page).
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { setCliAuthToken } from "@/lib/convex/server";

export async function ensureCliAuth(): Promise<void> {
  const email = process.env.DAYSPRING_CLI_EMAIL?.trim();
  const password = process.env.DAYSPRING_CLI_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "CLI scripts need a signed-in user — create an account at /signin, then set " +
        "DAYSPRING_CLI_EMAIL and DAYSPRING_CLI_PASSWORD in .env.local.",
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
  setCliAuthToken(token);
}
