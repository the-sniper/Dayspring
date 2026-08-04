import { after } from "next/server";
import { NextResponse } from "next/server";
import { cacheScope, convex, runAsUser } from "@/lib/convex/server";
import { api } from "@/convex/_generated/api";
import { todayDate } from "@/lib/orchestra/types";

// Kick today's orchestra from /company without holding an HTTP request open
// for the whole multi-minute run. The previous server-action path returned
// 200 after ~5 minutes, but the browser often dropped the fetch first
// ("TypeError: Failed to fetch" on OrchestraRunButton).
//
// Auth: cookie session via middleware. We capture the JWT up front and run
// the engine inside runAsUser so `after()` still has identity.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTIVE = new Set(["queued", "in_progress", "delivered"]);

// A task sitting in an ACTIVE status is only evidence of a LIVE run while it is
// still moving. When a run dies mid-flight (engine throw, server restart) its
// last task stays "in_progress"/"delivered" forever, and because the only thing
// that retires stale tasks is a NEW run, the gate below deadlocks the day: it
// refuses to start one, citing the corpse. Anything that hasn't moved in this
// long is treated as dead.
const STALE_MINUTES = 10;

function isLive(task: { status: string; updatedAt: string }): boolean {
  if (!ACTIVE.has(task.status)) return false;
  const moved = Date.parse(task.updatedAt);
  return Number.isFinite(moved) && Date.now() - moved < STALE_MINUTES * 60_000;
}

// In-process dedupe so a double-click can't start two overlapping runs before
// the first task rows land in Convex.
const starting = new Set<string>();

export async function POST() {
  const { convexAuthNextjsToken } = await import(
    "@convex-dev/auth/nextjs/server"
  );
  const token = await convexAuthNextjsToken();
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Not signed in." },
      { status: 401 },
    );
  }

  const scope = await runAsUser(token, async () => await cacheScope());
  const runDate = todayDate();

  const gate = await runAsUser(token, async () => {
    const { hasApiKey } = await import("@/lib/claude/client");
    if (!(await hasApiKey())) {
      return {
        kind: "no_key" as const,
      };
    }
    const existing = await convex().query(api.orchestra.latestReport, {
      runDate,
    });
    if (existing) return { kind: "already_ran" as const };
    const tasks = await convex().query(api.orchestra.tasksForRun, { runDate });
    if (tasks.some(isLive)) {
      return { kind: "already_running" as const };
    }
    // Stale ACTIVE rows are retired here rather than left to confuse the next
    // gate check — the run they belonged to is gone.
    const stale = tasks.filter((t) => ACTIVE.has(t.status));
    for (const t of stale) {
      await convex().mutation(api.orchestra.setTaskStatus, {
        taskId: t._id,
        status: "failed",
        statusReason: `Abandoned — no progress for over ${STALE_MINUTES} minutes; retired so a new run can start.`,
      });
    }
    return { kind: "ready" as const, retired: stale.length };
  });

  if (gate.kind === "no_key") {
    return NextResponse.json(
      {
        ok: false,
        error: "No Anthropic key — add it in Settings → API Keys first.",
      },
      { status: 400 },
    );
  }
  if (gate.kind === "already_ran") {
    return NextResponse.json({
      ok: true,
      started: false,
      alreadyRan: true,
    });
  }
  if (gate.kind === "already_running" || starting.has(scope)) {
    return NextResponse.json({
      ok: true,
      started: true,
      alreadyRunning: true,
    });
  }

  starting.add(scope);
  after(() => {
    void runAsUser(token, async () => {
      try {
        const { runOrchestra } = await import("@/lib/orchestra/run");
        await runOrchestra();
      } catch (err) {
        console.error(
          "[api/orchestra/run]",
          err instanceof Error ? err.message : err,
        );
      } finally {
        starting.delete(scope);
      }
    });
  });

  return NextResponse.json({ ok: true, started: true });
}
