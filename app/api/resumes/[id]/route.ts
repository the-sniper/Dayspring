// Streams a generated resume PDF from data/resumes/ (gitignored, not under
// public/). Local single-user app — no auth layer by design.
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { generatedResumes } from "@/lib/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) return new Response("Bad id", { status: 400 });

  const row = db
    .select()
    .from(generatedResumes)
    .where(eq(generatedResumes.id, id))
    .get();
  if (!row?.pdfPath || !fs.existsSync(row.pdfPath)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(fs.readFileSync(row.pdfPath)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${path.basename(row.pdfPath)}"`,
      "Cache-Control": "no-store",
    },
  });
}
