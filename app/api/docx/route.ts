// Build an ATS-safe DOCX from a (possibly unsaved) studio document. POSTed by
// the resume editor in both entry points, so downloads work pre-save and for
// the transient Resume Match flow. Local single-user app — no auth by design.
import { NextRequest } from "next/server";
import type { ResumeDocType } from "@/lib/claude/resume";
import { renderResumeDocx } from "@/lib/resumes/docx";
import { normalizeStyle } from "@/lib/resumes/style";

export async function POST(req: NextRequest) {
  let body: { doc?: ResumeDocType; style?: unknown; filename?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!body.doc || typeof body.doc !== "object" || !("name" in body.doc)) {
    return new Response("Missing doc", { status: 400 });
  }

  const buffer = await renderResumeDocx(body.doc, normalizeStyle(body.style));
  const name = (body.filename ?? "resume")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim() || "resume";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
