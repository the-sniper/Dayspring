// Streams a generated resume PDF. New generations live in Convex File
// Storage (works on hosted deployments); legacy rows fall back to the old
// local pdfPath. ?format=docx builds an ATS-safe Word document on the fly
// from the stored ResumeDoc JSON (works for all past generations).
import fs from "node:fs";
import path from "node:path";
import { api, convex, fetchStorageBytes } from "@/lib/convex/server";
import { renderResumeDocx } from "@/lib/resumes/docx";
import { normalizeStyle } from "@/lib/resumes/style";
import type { ResumeDocType } from "@/lib/claude/resume";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return new Response("Bad id", { status: 400 });

  const row = await convex().query(api.resumes.getGenerated, { id: id as never });
  if (!row) return new Response("Not found", { status: 404 });

  const baseName = row.fileName
    ? path.basename(row.fileName, ".pdf")
    : row.pdfPath
      ? path.basename(row.pdfPath, ".pdf")
      : `resume-${row._id}`;

  if (new URL(req.url).searchParams.get("format") === "docx") {
    let doc: ResumeDocType;
    try {
      doc = JSON.parse(row.content) as ResumeDocType;
    } catch {
      return new Response("Stored resume is not renderable", { status: 500 });
    }
    let style: unknown = null;
    try {
      style = row.style ? JSON.parse(row.style) : null;
    } catch {
      style = null;
    }
    const buffer = await renderResumeDocx(doc, normalizeStyle(style));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${baseName}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdf = await generatedPdfBytes(row);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${baseName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

async function generatedPdfBytes(row: {
  pdfFileId?: string | null;
  pdfPath?: string | null;
}): Promise<Buffer | null> {
  if (row.pdfFileId) {
    const bytes = await fetchStorageBytes(String(row.pdfFileId));
    if (bytes) return bytes;
  }
  if (row.pdfPath && fs.existsSync(row.pdfPath)) return fs.readFileSync(row.pdfPath);
  return null;
}
