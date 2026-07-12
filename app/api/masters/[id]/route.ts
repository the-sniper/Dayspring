// Streams a master resume's ORIGINAL uploaded PDF — the profile page's
// Download button. New uploads live in Convex File Storage; legacy rows fall
// back to the old local sourceFile path.
import fs from "node:fs";
import path from "node:path";
import { api, convex, fetchStorageBytes } from "@/lib/convex/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return new Response("Bad id", { status: 400 });

  const row = await convex().query(api.resumes.getMaster, { id: id as never });
  if (!row) return new Response("Not found", { status: 404 });

  let bytes: Buffer | null = null;
  let filename = `${row.label || "resume"}.pdf`;
  if (row.sourceFileId) {
    bytes = await fetchStorageBytes(String(row.sourceFileId));
  }
  if (!bytes && row.sourceFile && fs.existsSync(row.sourceFile)) {
    bytes = fs.readFileSync(row.sourceFile);
    filename = path.basename(row.sourceFile);
  }
  if (!bytes) return new Response("No stored file for this master", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
