// In-app Gmail connect, step 2: exchange the code, store the refresh token +
// connected address (same settings rows the CLI flow used), bounce to Settings.
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { exchangeCode } from "@/lib/integrations/gmail/oauth";
import { getKey } from "@/lib/keys";

function fail(message: string): never {
  redirect(`/settings?gmailError=${encodeURIComponent(message)}`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (err) fail(`Google said: ${err}`);
  if (!code) fail("Google returned no authorization code.");

  const clientId = getKey("GOOGLE_CLIENT_ID");
  const clientSecret = getKey("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) fail("Google client credentials are missing.");

  let refreshToken: string | null = null;
  let accessToken: string;
  try {
    const tokens = await exchangeCode({
      clientId: clientId!,
      clientSecret: clientSecret!,
      code: code!,
      redirectUri: `${url.origin}/api/gmail/callback`,
    });
    refreshToken = tokens.refreshToken;
    accessToken = tokens.accessToken;
  } catch (e) {
    fail(e instanceof Error ? e.message : "Token exchange failed.");
  }
  if (!refreshToken) {
    fail(
      "Google returned no refresh token — remove Dayspring's access at myaccount.google.com/permissions and connect again.",
    );
  }

  // Who did we just connect?
  const profileRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { authorization: `Bearer ${accessToken!}` }, cache: "no-store" },
  ).catch(() => null);
  const profile = ((await profileRes?.json().catch(() => null)) ?? {}) as {
    emailAddress?: string;
  };

  const now = new Date().toISOString();
  for (const [key, value] of [
    ["gmailRefreshToken", refreshToken!],
    ["gmailEmail", profile.emailAddress ?? ""],
  ] as const) {
    db.insert(settings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
      .run();
  }

  redirect(`/settings?gmail=connected${profile.emailAddress ? `+as+${encodeURIComponent(profile.emailAddress)}` : ""}`);
}
