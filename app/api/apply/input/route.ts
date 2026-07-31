import { NextResponse } from "next/server";
import { dispatchSessionInput, type SessionInput } from "@/lib/apply/session";

// Click/keystroke passthrough for the embedded apply session's live view.
export const dynamic = "force-dynamic";

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

function parse(body: unknown): SessionInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.kind === "click" && num(b.x) && num(b.y)) {
    return { kind: "click", x: b.x as number, y: b.y as number };
  }
  if (b.kind === "wheel" && num(b.x) && num(b.y) && num(b.deltaY)) {
    return { kind: "wheel", x: b.x as number, y: b.y as number, deltaY: b.deltaY as number };
  }
  if (b.kind === "text" && typeof b.text === "string" && b.text.length > 0) {
    return { kind: "text", text: b.text };
  }
  if (b.kind === "key" && typeof b.key === "string") {
    return { kind: "key", key: b.key };
  }
  return null;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const ev = parse(body);
  if (!ev) return NextResponse.json({ ok: false, error: "bad input event" }, { status: 400 });
  const res = await dispatchSessionInput(ev);
  return NextResponse.json(res, { status: res.ok ? 200 : 409 });
}
