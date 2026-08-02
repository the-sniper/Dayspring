import { NextResponse } from "next/server";
import { runAsUser } from "@/lib/convex/server";
import { signInAsOperator } from "@/lib/convex/cli-auth";

// Hosted daily orchestra run — same pattern as /api/cron/linkedin: the
// Anthropic key is vault-sealed and only the Next process can unseal it, so
// Vercel Cron calls this route (schedule it after the job pull, e.g. 12:00 UTC).
// Idempotent per day: a second call returns the existing report.
//
// NOTE (multi-customer): like the LinkedIn cron, this runs as the operator
// account. When customer accounts get their own scheduled runs, this route
// grows a per-user fan-out (iterate users, runAsUser each) — the engine
// itself is already per-user-scoped.
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
      const { hasApiKey } = await import("@/lib/claude/client");
      if (!(await hasApiKey())) return null;
      const { runOrchestra } = await import("@/lib/orchestra/run");
      return await runOrchestra();
    });
    if (!result) {
      return NextResponse.json({
        ok: true,
        skipped: "no Anthropic key saved for this account",
      });
    }
    return NextResponse.json({ ok: true, ran: result.ran, stats: result.stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
