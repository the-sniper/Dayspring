import { NextResponse } from "next/server";
import { getSessionFrame } from "@/lib/apply/session";

// Latest screencast frame of the embedded apply session. Auth is enforced by
// the middleware; the session itself is one-per-process (local, single-user).
export const dynamic = "force-dynamic";

export async function GET() {
  const frame = getSessionFrame();
  if (!frame) return new NextResponse(null, { status: 204 });
  return new NextResponse(new Uint8Array(frame.data), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Frame-Width": String(frame.width),
      "X-Frame-Height": String(frame.height),
    },
  });
}
