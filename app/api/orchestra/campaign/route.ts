import { after } from "next/server";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { cacheScope, convex, runAsUser } from "@/lib/convex/server";

// Kick one campaign stage without holding an HTTP request open for it. Same
// shape as /api/orchestra/run: capture the JWT, answer immediately, do the
// work inside after() under runAsUser so the background call still has an
// identity. The Studio watches Convex for the stage flip — no polling of this
// route, no dropped fetch after five minutes.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Stages the engine may pick up. Anything else is a checkpoint waiting on the
// human, and starting a run from one would be a bug, not a retry.
const RUNNABLE = new Set(["researching", "deep_research", "drafting"]);
const STALE_MINUTES = 12;

// In-process dedupe: a double-click can't start the same stage twice before
// the first one's writes land.
const running = new Set<string>();

export async function POST(req: Request) {
  const { convexAuthNextjsToken } = await import(
    "@convex-dev/auth/nextjs/server"
  );
  const token = await convexAuthNextjsToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    campaignId?: string;
    retry?: boolean;
  };
  if (!body.campaignId) {
    return NextResponse.json(
      { ok: false, error: "campaignId is required." },
      { status: 400 },
    );
  }

  const scope = await runAsUser(token, async () => await cacheScope());
  const key = `${scope}:${body.campaignId}`;

  const gate = await runAsUser(token, async () => {
    const { hasApiKey } = await import("@/lib/claude/client");
    if (!(await hasApiKey())) return { kind: "no_key" as const };
    const c = await convex().query(api.campaigns.get, {
      campaignId: body.campaignId as never,
    });
    if (!c) return { kind: "not_found" as const };
    if (body.retry) return { kind: "retry" as const };
    if (!RUNNABLE.has(c.stage)) {
      return { kind: "not_runnable" as const, stage: c.stage };
    }
    // A stage that started recently is presumed alive; past that it's a
    // corpse from a dead process and re-running is the right move.
    const since = Date.now() - Date.parse(c.stageStartedAt);
    if (running.has(key) && since < STALE_MINUTES * 60_000) {
      return { kind: "already_running" as const, stage: c.stage };
    }
    return { kind: "ready" as const, stage: c.stage };
  });

  if (gate.kind === "no_key") {
    return NextResponse.json(
      { ok: false, error: "No Anthropic key — add it in Settings → API Keys first." },
      { status: 400 },
    );
  }
  if (gate.kind === "not_found") {
    return NextResponse.json({ ok: false, error: "Campaign not found." }, { status: 404 });
  }
  if (gate.kind === "not_runnable") {
    return NextResponse.json({ ok: true, started: false, stage: gate.stage });
  }
  if (gate.kind === "already_running") {
    return NextResponse.json({ ok: true, started: true, alreadyRunning: true, stage: gate.stage });
  }

  running.add(key);
  const retry = gate.kind === "retry";
  after(() => {
    void runAsUser(token, async () => {
      try {
        const { advanceCampaign, retryCampaign } = await import(
          "@/lib/orchestra/campaign"
        );
        if (retry) await retryCampaign(body.campaignId!);
        else await advanceCampaign(body.campaignId!);
      } catch (err) {
        console.error(
          "[api/orchestra/campaign]",
          err instanceof Error ? err.message : err,
        );
      } finally {
        running.delete(key);
      }
    });
  });

  return NextResponse.json({ ok: true, started: true });
}
