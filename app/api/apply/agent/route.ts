import { NextResponse } from "next/server";
import {
  advanceSession,
  cancelSession,
  fillSessionField,
  getSessionState,
  skipFill,
  snapshotSession,
  startSession,
} from "@/lib/apply/session";

// The MCP apply loop's way in.
//
// The apply session is a singleton on globalThis inside THIS Next process, and
// the MCP server is a separate stdio process, so it cannot reach the session
// directly — it has to come over HTTP. It also carries no session cookie, so it
// authenticates with a shared secret exactly like the cron routes do.
//
// Note what is NOT dispatchable here: approveAndSubmit, recordManualSubmit and
// resolveVerdict. Filling a form is delegable; deciding that an application is
// ready to send is not. Those stay UI actions.
export const dynamic = "force-dynamic";

type Body = {
  op?: string;
  jobId?: string;
  ref?: string;
  value?: string;
  embedded?: boolean;
  masterResumeId?: string | null;
};

export async function POST(request: Request) {
  const secret = process.env.DAYSPRING_AGENT_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "DAYSPRING_AGENT_SECRET is not configured — the MCP apply loop is disabled. Set it in .env.local to enable.",
      },
      { status: 404 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  switch (body.op) {
    case "state":
      return NextResponse.json({ ok: true, state: getSessionState() ?? null });

    case "open": {
      if (!body.jobId) {
        return NextResponse.json({ ok: false, error: "jobId required" }, { status: 400 });
      }
      const res = await startSession(body.jobId, {
        embedded: body.embedded ?? false,
        masterResumeId: body.masterResumeId ?? null,
      });
      return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    }

    case "snapshot": {
      const res = await snapshotSession();
      return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    }

    case "fill": {
      if (!body.ref || typeof body.value !== "string") {
        return NextResponse.json({ ok: false, error: "ref and value required" }, { status: 400 });
      }
      const res = await fillSessionField(body.ref, body.value);
      return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    }

    case "advance": {
      const res = await advanceSession();
      return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    }

    case "skip_fill": {
      const res = await skipFill();
      return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    }

    case "cancel": {
      const res = await cancelSession();
      return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    }

    default:
      return NextResponse.json(
        { ok: false, error: `unknown op: ${body.op ?? "(none)"}` },
        { status: 400 },
      );
  }
}
