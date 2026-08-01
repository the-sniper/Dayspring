import { NextResponse } from "next/server";
import { runAsUser } from "@/lib/convex/server";
import { signInAsOperator } from "@/lib/convex/cli-auth";
import { hasLinkedinPostsKey } from "@/lib/integrations/linkedin/posts";
import { pullLinkedinPosts } from "@/lib/linkedin/pull";

// Hosted daily LinkedIn-post pull. The ATS pull runs inside Convex (see
// convex/crons.ts) because public boards need no credentials — this one can't:
// the Apify token is sealed with DAYSPRING_VAULT_KEY, which only the Next
// process holds. So Vercel Cron calls this route instead.
//
// Public in the middleware matcher (no session cookie on a cron request) and
// therefore gated on CRON_SECRET; it signs in with the operator credentials and
// scopes that identity to this call tree only.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured — route disabled." },
      { status: 404 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = await signInAsOperator();
    const result = await runAsUser(token, async () => {
      if (!(await hasLinkedinPostsKey())) return null;
      return await pullLinkedinPosts();
    });
    if (!result) {
      return NextResponse.json({
        ok: true,
        skipped: "no Apify token saved for this account",
      });
    }
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
