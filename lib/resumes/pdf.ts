// Server-side PDF rendering — the same ResumePdf component the studio previews,
// rendered to a Buffer with @react-pdf/renderer's node build. Replaces the old
// Playwright/Chromium pipeline (faster, no browser launch, preview-identical).
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ResumeDocType } from "@/lib/claude/resume";
import { ResumePdf } from "@/lib/resumes/template";
import { DEFAULT_STYLE, type ResumeStyle } from "@/lib/resumes/style";

// Renders to a Buffer only — callers upload to Convex File Storage (hosted
// deployments have no writable disk).
export async function renderResumePdfBuffer(
  doc: ResumeDocType,
  style: ResumeStyle = DEFAULT_STYLE,
): Promise<Buffer> {
  return renderToBuffer(createElement(ResumePdf, { doc, style }));
}
