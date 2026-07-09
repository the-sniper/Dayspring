// In-app Gmail connect, step 1: redirect to Google's consent screen. The
// redirect URI is this app's own origin (localhost loopback — permitted for
// Desktop-type OAuth clients without pre-registration).
import { redirect } from "next/navigation";
import { buildConsentUrl } from "@/lib/integrations/gmail/oauth";
import { getKey } from "@/lib/keys";

export async function GET(req: Request) {
  const clientId = getKey("GOOGLE_CLIENT_ID");
  if (!clientId || !getKey("GOOGLE_CLIENT_SECRET")) {
    redirect("/settings?gmailError=Add+the+Google+client+ID+and+secret+in+API+Keys+first");
  }
  const origin = new URL(req.url).origin;
  redirect(buildConsentUrl(clientId!, `${origin}/api/gmail/callback`));
}
