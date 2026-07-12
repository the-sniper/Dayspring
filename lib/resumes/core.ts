// Next-free resume-factory core — used by actions, apply-assist, and scripts.
// PDF bytes (original master uploads + rendered tailored resumes) live in
// Convex File Storage so hosted deployments (read-only disk) work; legacy
// local-disk paths (sourceFile / pdfPath) are still readable as a fallback.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  api,
  cleanDoc,
  convex,
  fetchStorageBytes,
  uploadPdfToStorage,
} from "@/lib/convex/server";
import {
  extractResumeVerified,
  generateResume,
  type ParsedResume,
  type ResumeDocType,
} from "@/lib/claude/resume";
import { MODEL_PREMIUM } from "@/lib/claude/client";
import { auditResumeDoc } from "@/lib/claude/resume-audit";
import { latestJobBrief } from "@/lib/research/core";
import { renderResumePdfBuffer } from "@/lib/resumes/pdf";
import { DEFAULT_STYLE } from "@/lib/resumes/style";
import { getSetting, setSetting } from "@/lib/settings/store";
import type { ResumeAudit } from "@/lib/resumes/audit-types";

export type MasterResumeRow = {
  id: string;
  label: string;
  content: string;
  sourceFile: string | null; // legacy local path (pre-hosting installs)
  sourceFileId: string | null; // Convex storage id for the original PDF
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

// Does this master have a downloadable/attachable original PDF?
export function masterHasPdf(m: Pick<MasterResumeRow, "sourceFile" | "sourceFileId">): boolean {
  return !!m.sourceFileId || !!m.sourceFile?.endsWith(".pdf");
}

export async function listMasters(): Promise<MasterResumeRow[]> {
  const rows = await convex().query(api.resumes.listMasters, {});
  return rows
    .map((m) => ({
      id: m.id,
      label: m.label,
      content: m.content,
      sourceFile: m.sourceFile ?? null,
      sourceFileId: m.sourceFileId ? String(m.sourceFileId) : null,
      isPrimary: !!m.isPrimary,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }))
    .sort((a, b) =>
      a.isPrimary === b.isPrimary ? a.label.localeCompare(b.label) : a.isPrimary ? -1 : 1,
    );
}

export async function mastersCount(): Promise<number> {
  return await convex().query(api.resumes.mastersCount, {});
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";
}

export type IngestResult = {
  id: string;
  label: string;
  chars: number;
  seededProfile: boolean;
  // PDF parses carry the fidelity-audit outcome; md/txt are stored verbatim.
  parse: Pick<ParsedResume, "faithful" | "problems" | "passes"> | null;
};

// Ingest an uploaded master resume. PDFs go through the VERIFIED Claude
// transcription (extract → audit → repair); md/txt are stored as-is. The
// original file is kept in Convex File Storage so a PDF master doubles as a
// directly-attachable fallback resume — and so it can be re-parsed later.
export async function ingestMasterFile(args: {
  filename: string;
  buffer: Buffer;
}): Promise<IngestResult> {
  const ext = path.extname(args.filename).toLowerCase();
  const label = path.basename(args.filename, path.extname(args.filename)).slice(0, 60) || "resume";

  let content: string;
  let sourceFileId: string | null = null;
  let parse: IngestResult["parse"] = null;

  if (ext === ".pdf") {
    sourceFileId = await uploadPdfToStorage(args.buffer);
    const parsed = await extractResumeVerified(args.buffer.toString("base64"));
    content = parsed.markdown;
    parse = { faithful: parsed.faithful, problems: parsed.problems, passes: parsed.passes };
  } else if (ext === ".md" || ext === ".txt") {
    content = args.buffer.toString("utf-8").trim();
    if (!content) throw new Error("That file is empty.");
  } else {
    throw new Error("Upload a .pdf, .md, or .txt (export DOCX to PDF first).");
  }

  const now = new Date().toISOString();
  const first = (await mastersCount()) === 0;
  const id = await convex().mutation(api.resumes.insertMaster, {
    doc: cleanDoc({
      label,
      content,
      sourceFileId,
      isPrimary: first, // first upload becomes the primary automatically
      createdAt: now,
      updatedAt: now,
    }),
  });

  return {
    id,
    label,
    chars: content.length,
    seededProfile: await maybeSeedProfile(content),
    parse,
  };
}

// Bytes of a master's original PDF: Convex storage first, legacy disk second.
async function masterPdfBytes(row: {
  sourceFile?: string | null;
  sourceFileId?: string | null;
}): Promise<Buffer | null> {
  if (row.sourceFileId) {
    const bytes = await fetchStorageBytes(String(row.sourceFileId));
    if (bytes) return bytes;
  }
  if (row.sourceFile?.endsWith(".pdf") && fs.existsSync(row.sourceFile)) {
    return fs.readFileSync(row.sourceFile);
  }
  return null;
}

// Re-run the verified parse from the stored original PDF — for when a parse
// predates a parser upgrade, or the human wants another pass. Updates ONLY
// this master's content; the scoring profile is never touched (it may carry
// user-written preferences).
export async function reparseMaster(id: string): Promise<{
  label: string;
  chars: number;
  content: string;
  parse: NonNullable<IngestResult["parse"]>;
}> {
  const row = await convex().query(api.resumes.getMaster, { id: id as never });
  if (!row) throw new Error("Master resume not found.");
  const bytes = await masterPdfBytes(row);
  if (!bytes) {
    throw new Error("No stored PDF for this master — re-parse applies to PDF uploads.");
  }
  const parsed = await extractResumeVerified(bytes.toString("base64"));
  await convex().mutation(api.resumes.patchMaster, {
    id: id as never,
    patch: { content: parsed.markdown, updatedAt: new Date().toISOString() },
  });
  return {
    label: row.label,
    chars: parsed.markdown.length,
    content: parsed.markdown,
    parse: { faithful: parsed.faithful, problems: parsed.problems, passes: parsed.passes },
  };
}

// Human fix-up of a parse — the final quality backstop. Content only.
export async function updateMasterContent(id: string, content: string): Promise<void> {
  const clean = content.trim();
  if (!clean) throw new Error("Content can't be empty.");
  const row = await convex().query(api.resumes.getMaster, { id: id as never });
  if (!row) throw new Error("Master resume not found.");
  await convex().mutation(api.resumes.patchMaster, {
    id: id as never,
    patch: { content: clean, updatedAt: new Date().toISOString() },
  });
}

// If the scoring profile is still the seed stub, replace it with the master
// content + a preferences scaffold — one upload unlocks scoring/tailoring.
async function maybeSeedProfile(content: string): Promise<boolean> {
  const existing = await getSetting("profile");
  if (existing && !existing.startsWith("REPLACE ME")) return false;
  const value = `${content}

---
PREFERENCES (edit these in Settings — scoring reads them):
- Target roles:
- Locations:
- Visa / work authorization:
- Salary floor:`;
  await setSetting("profile", value);
  return true;
}

export async function deleteMaster(id: string): Promise<void> {
  const row = await convex().query(api.resumes.getMaster, { id: id as never });
  if (!row) return;
  // Legacy local file (pre-hosting installs) — best effort; the Convex-side
  // removeMaster deletes the storage file.
  if (row.sourceFile && fs.existsSync(row.sourceFile)) {
    try {
      fs.rmSync(row.sourceFile);
    } catch {
      // read-only disk (hosted) — nothing to clean up there anyway
    }
  }
  await convex().mutation(api.resumes.removeMaster, { id: id as never });
}

export async function setPrimaryMaster(id: string): Promise<void> {
  await convex().mutation(api.resumes.setPrimaryMaster, { id: id as never });
}

export type GeneratedResumeRow = {
  id: string;
  jobId: string;
  pdfPath: string | null; // legacy local path
  pdfFileId: string | null; // Convex storage id
  fileName: string | null;
  tailoringNote: string | null;
  model: string | null;
  createdAt: string;
};

export async function latestGeneratedForJob(jobId: string): Promise<GeneratedResumeRow | null> {
  const row = await convex().query(api.resumes.latestForJob, { jobId: jobId as never });
  if (!row) return null;
  return {
    id: row.id,
    jobId: String(row.jobId),
    pdfPath: row.pdfPath ?? null,
    pdfFileId: row.pdfFileId ? String(row.pdfFileId) : null,
    fileName: row.fileName ?? null,
    tailoringNote: row.tailoringNote ?? null,
    model: row.model ?? null,
    createdAt: row.createdAt,
  };
}

// Generate + audit + render a tailored resume for a job. Regenerate = new row
// (history kept). The latest research brief rides along as employer context.
// The fabrication audit compares the output against the full master corpus and
// is stored on the row so the studio can show highlights on later opens.
export async function generateForJob(jobId: string): Promise<{
  id: string;
  tailoringNote: string;
  doc: ResumeDocType;
  audit: ResumeAudit | null;
  sourceText: string;
  jd: string;
}> {
  const masters = await listMasters();
  if (masters.length === 0) {
    throw new Error("Upload a master resume in Settings first.");
  }
  const job = await convex().query(api.jobs.getWithCompany, { id: jobId as never });
  if (!job) throw new Error("Job not found");
  if (!job.description?.trim()) {
    throw new Error("This job has no description to tailor against — paste one in Edit Details.");
  }

  const brief = (await latestJobBrief(jobId))?.brief;
  const { doc } = await generateResume(
    masters.map((m) => ({ label: m.label, content: m.content })),
    {
      title: job.title,
      companyName: job.companyName,
      location: job.location ?? null,
      description: job.description,
    },
    brief,
  );

  const sourceText = masters
    .map((m) => `=== MASTER RESUME: ${m.label} ===\n${m.content}`)
    .join("\n\n");
  // The audit is a safety net, not a gate — if it errors the resume still
  // ships to the studio, just without highlights.
  let audit: ResumeAudit | null = null;
  try {
    audit = await auditResumeDoc(sourceText, doc);
  } catch {
    audit = null;
  }

  const fileName = `job-${jobId}-${slugify(job.companyName)}-${slugify(job.title)}-${Date.now()}.pdf`;
  const pdfBuffer = await renderResumePdfBuffer(doc, DEFAULT_STYLE);
  const pdfFileId = await uploadPdfToStorage(pdfBuffer);

  const id = await convex().mutation(api.resumes.insertGenerated, {
    doc: cleanDoc({
      jobId,
      content: JSON.stringify(doc),
      pdfFileId,
      fileName,
      style: JSON.stringify(DEFAULT_STYLE),
      audit: audit ? JSON.stringify(audit) : null,
      tailoringNote: doc.tailoring_note,
      model: MODEL_PREMIUM,
      createdAt: new Date().toISOString(),
    }),
  });

  return {
    id,
    tailoringNote: doc.tailoring_note,
    doc,
    audit,
    sourceText,
    jd: job.description,
  };
}

// Resume resolution for apply-assist (local machine only — Playwright uploads
// a file from disk): tailored PDF for this job → primary master's original
// PDF → the static resumePath setting. Storage-backed PDFs are downloaded to
// a temp file so the browser can attach them.
export async function resumePdfForJob(jobId: string): Promise<{
  path: string;
  source: "tailored" | "master" | "settings";
} | null> {
  const gen = await latestGeneratedForJob(jobId);
  if (gen?.pdfFileId) {
    const local = await downloadToTemp(gen.pdfFileId, gen.fileName ?? `resume-${gen.id}.pdf`);
    if (local) return { path: local, source: "tailored" };
  }
  if (gen?.pdfPath && fs.existsSync(gen.pdfPath)) {
    return { path: gen.pdfPath, source: "tailored" };
  }
  const primary = (await listMasters()).find((m) => m.isPrimary && masterHasPdf(m));
  if (primary?.sourceFileId) {
    const local = await downloadToTemp(primary.sourceFileId, `master-${primary.id}.pdf`);
    if (local) return { path: local, source: "master" };
  }
  if (primary?.sourceFile && fs.existsSync(primary.sourceFile)) {
    return { path: primary.sourceFile, source: "master" };
  }
  const setting = await getSetting("resumePath");
  if (setting && fs.existsSync(setting)) return { path: setting, source: "settings" };
  return null;
}

async function downloadToTemp(fileId: string, fileName: string): Promise<string | null> {
  const bytes = await fetchStorageBytes(fileId);
  if (!bytes) return null;
  const dir = path.join(os.tmpdir(), "dayspring-resumes");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, fileName.replace(/[^a-zA-Z0-9._-]/g, "_"));
  fs.writeFileSync(p, bytes);
  return p;
}
