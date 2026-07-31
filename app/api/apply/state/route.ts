import { NextResponse } from "next/server";
import { getSessionState } from "@/lib/apply/session";

// Raw session state as JSON — used by the live-view surfaces alongside the
// server-action poll. Auth enforced by middleware.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSessionState() ?? null);
}
