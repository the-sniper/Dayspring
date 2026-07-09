// Streams a master resume's ORIGINAL uploaded PDF (data/resumes/masters/) —
// the profile page's Download button. Local single-user app, no auth layer.
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { masterResumes } from "@/lib/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return new Response("Bad id", { status: 400 });

  const row = db.select().from(masterResumes).where(eq(masterResumes.id, id)).get();
  if (!row?.sourceFile || !fs.existsSync(row.sourceFile)) {
    return new Response("No stored file for this master", { status: 404 });
  }
  return new Response(new Uint8Array(fs.readFileSync(row.sourceFile)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${path.basename(row.sourceFile)}"`,
      "Cache-Control": "no-store",
    },
  });
}
