// Streams a generated resume from data/resumes/ (gitignored, not under
// public/). PDF by default; ?format=docx builds an ATS-safe Word document on
// the fly from the stored ResumeDoc JSON (works for all past generations — no
// schema change). Local single-user app — no auth layer by design.
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { generatedResumes } from "@/lib/db/schema";
import { renderResumeDocx } from "@/lib/resumes/docx";
import { normalizeStyle } from "@/lib/resumes/style";
import type { ResumeDocType } from "@/lib/claude/resume";

export async function GET(
  req: Request,
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
  if (!row) return new Response("Not found", { status: 404 });

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
    const base = row.pdfPath
      ? path.basename(row.pdfPath, ".pdf")
      : `resume-${row.id}`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${base}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (!row.pdfPath || !fs.existsSync(row.pdfPath)) {
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
