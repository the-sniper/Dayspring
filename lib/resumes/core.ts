// Next-free resume-factory core — used by actions, apply-assist, and scripts.
import fs from "node:fs";
import path from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, generatedResumes, jobs, masterResumes, settings } from "@/lib/db/schema";
import {
  extractResumeVerified,
  generateResume,
  type ParsedResume,
} from "@/lib/claude/resume";
import { MODEL_PREMIUM } from "@/lib/claude/client";
import { latestJobBrief } from "@/lib/research/core";
import { RESUMES_DIR, renderResumePdf } from "@/lib/resumes/render";

const MASTERS_DIR = path.join(RESUMES_DIR, "masters");

export type MasterResumeRow = {
  id: number;
  label: string;
  content: string;
  sourceFile: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export function listMasters(): MasterResumeRow[] {
  return db.select().from(masterResumes).orderBy(desc(masterResumes.isPrimary), masterResumes.label).all();
}

export function mastersCount(): number {
  return db.select({ n: sql<number>`count(*)` }).from(masterResumes).get()?.n ?? 0;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";
}

export type IngestResult = {
  id: number;
  label: string;
  chars: number;
  seededProfile: boolean;
  // PDF parses carry the fidelity-audit outcome; md/txt are stored verbatim.
  parse: Pick<ParsedResume, "faithful" | "problems" | "passes"> | null;
};

// Ingest an uploaded master resume. PDFs go through the VERIFIED Claude
// transcription (extract → audit → repair); md/txt are stored as-is. The
// original file is kept on disk so a PDF master doubles as a
// directly-attachable fallback resume — and so it can be re-parsed later.
export async function ingestMasterFile(args: {
  filename: string;
  buffer: Buffer;
}): Promise<IngestResult> {
  const ext = path.extname(args.filename).toLowerCase();
  const label = path.basename(args.filename, path.extname(args.filename)).slice(0, 60) || "resume";

  let content: string;
  let sourceFile: string | null = null;
  let parse: IngestResult["parse"] = null;

  if (ext === ".pdf") {
    fs.mkdirSync(MASTERS_DIR, { recursive: true });
    sourceFile = path.join(
      MASTERS_DIR,
      `${Date.now()}-${slugify(label)}.pdf`,
    );
    fs.writeFileSync(sourceFile, args.buffer);
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
  const first = mastersCount() === 0;
  const res = db
    .insert(masterResumes)
    .values({
      label,
      content,
      sourceFile,
      isPrimary: first, // first upload becomes the primary automatically
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id: Number(res.lastInsertRowid),
    label,
    chars: content.length,
    seededProfile: maybeSeedProfile(content),
    parse,
  };
}

// Re-run the verified parse from the stored original PDF — for when a parse
// predates a parser upgrade, or the human wants another pass. Updates ONLY
// this master's content; the scoring profile is never touched (it may carry
// user-written preferences).
export async function reparseMaster(id: number): Promise<{
  label: string;
  chars: number;
  content: string;
  parse: NonNullable<IngestResult["parse"]>;
}> {
  const row = db.select().from(masterResumes).where(eq(masterResumes.id, id)).get();
  if (!row) throw new Error("Master resume not found.");
  if (!row.sourceFile?.endsWith(".pdf") || !fs.existsSync(row.sourceFile)) {
    throw new Error("No stored PDF for this master — re-parse applies to PDF uploads.");
  }
  const parsed = await extractResumeVerified(
    fs.readFileSync(row.sourceFile).toString("base64"),
  );
  db.update(masterResumes)
    .set({ content: parsed.markdown, updatedAt: new Date().toISOString() })
    .where(eq(masterResumes.id, id))
    .run();
  return {
    label: row.label,
    chars: parsed.markdown.length,
    content: parsed.markdown,
    parse: { faithful: parsed.faithful, problems: parsed.problems, passes: parsed.passes },
  };
}

// Human fix-up of a parse — the final quality backstop. Content only.
export function updateMasterContent(id: number, content: string): void {
  const clean = content.trim();
  if (!clean) throw new Error("Content can't be empty.");
  const res = db
    .update(masterResumes)
    .set({ content: clean, updatedAt: new Date().toISOString() })
    .where(eq(masterResumes.id, id))
    .run();
  if (res.changes === 0) throw new Error("Master resume not found.");
}

// If the scoring profile is still the seed stub, replace it with the master
// content + a preferences scaffold — one upload unlocks scoring/tailoring.
function maybeSeedProfile(content: string): boolean {
  const row = db.select().from(settings).where(eq(settings.key, "profile")).get();
  if (row && !row.value.startsWith("REPLACE ME")) return false;
  const now = new Date().toISOString();
  const value = `${content}

---
PREFERENCES (edit these in Settings — scoring reads them):
- Target roles:
- Locations:
- Visa / work authorization:
- Salary floor:`;
  db.insert(settings)
    .values({ key: "profile", value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
    .run();
  return true;
}

export function deleteMaster(id: number): void {
  const row = db.select().from(masterResumes).where(eq(masterResumes.id, id)).get();
  if (!row) return;
  // Only remove files we put in our own masters dir.
  if (row.sourceFile && row.sourceFile.startsWith(MASTERS_DIR) && fs.existsSync(row.sourceFile)) {
    fs.rmSync(row.sourceFile);
  }
  db.delete(masterResumes).where(eq(masterResumes.id, id)).run();
}

export function setPrimaryMaster(id: number): void {
  db.update(masterResumes).set({ isPrimary: false }).run();
  db.update(masterResumes).set({ isPrimary: true }).where(eq(masterResumes.id, id)).run();
}

export type GeneratedResumeRow = {
  id: number;
  jobId: number;
  pdfPath: string | null;
  tailoringNote: string | null;
  model: string | null;
  createdAt: string;
};

export function latestGeneratedForJob(jobId: number): GeneratedResumeRow | null {
  const row = db
    .select({
      id: generatedResumes.id,
      jobId: generatedResumes.jobId,
      pdfPath: generatedResumes.pdfPath,
      tailoringNote: generatedResumes.tailoringNote,
      model: generatedResumes.model,
      createdAt: generatedResumes.createdAt,
    })
    .from(generatedResumes)
    .where(eq(generatedResumes.jobId, jobId))
    .orderBy(desc(generatedResumes.createdAt), desc(generatedResumes.id))
    .get();
  return row ?? null;
}

// Generate + render a tailored resume for a job. Regenerate = new row (history
// kept). The latest research brief rides along as employer context.
export async function generateForJob(
  jobId: number,
): Promise<{ id: number; pdfPath: string; tailoringNote: string }> {
  const masters = listMasters();
  if (masters.length === 0) {
    throw new Error("Upload a master resume in Settings first.");
  }
  const row = db
    .select({ job: jobs, companyName: companies.name })
    .from(jobs)
    .innerJoin(companies, eq(jobs.companyId, companies.id))
    .where(eq(jobs.id, jobId))
    .get();
  if (!row) throw new Error("Job not found");
  if (!row.job.description?.trim()) {
    throw new Error("This job has no description to tailor against — paste one in Edit Details.");
  }

  const { doc } = await generateResume(
    masters.map((m) => ({ label: m.label, content: m.content })),
    {
      title: row.job.title,
      companyName: row.companyName,
      location: row.job.location,
      description: row.job.description,
    },
    latestJobBrief(jobId)?.brief,
  );

  const pdfPath = path.join(
    RESUMES_DIR,
    `job-${jobId}-${slugify(row.companyName)}-${slugify(row.job.title)}-${Date.now()}.pdf`,
  );
  await renderResumePdf(doc, pdfPath);

  const res = db
    .insert(generatedResumes)
    .values({
      jobId,
      content: JSON.stringify(doc),
      pdfPath,
      tailoringNote: doc.tailoring_note,
      model: MODEL_PREMIUM,
      createdAt: new Date().toISOString(),
    })
    .run();

  return { id: Number(res.lastInsertRowid), pdfPath, tailoringNote: doc.tailoring_note };
}

// Resume resolution for apply-assist: tailored PDF for this job → primary
// master's original PDF → the static resumePath setting.
export function resumePdfForJob(jobId: number): {
  path: string;
  source: "tailored" | "master" | "settings";
} | null {
  const gen = latestGeneratedForJob(jobId);
  if (gen?.pdfPath && fs.existsSync(gen.pdfPath)) {
    return { path: gen.pdfPath, source: "tailored" };
  }
  const primary = listMasters().find((m) => m.isPrimary && m.sourceFile?.endsWith(".pdf"));
  if (primary?.sourceFile && fs.existsSync(primary.sourceFile)) {
    return { path: primary.sourceFile, source: "master" };
  }
  const setting =
    db.select().from(settings).where(eq(settings.key, "resumePath")).get()?.value ?? null;
  if (setting && fs.existsSync(setting)) return { path: setting, source: "settings" };
  return null;
}
