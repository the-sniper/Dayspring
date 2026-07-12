"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { api, convex } from "@/lib/convex/server";
import { hasApiKey } from "@/lib/claude/client";
import type { ResumeDocType } from "@/lib/claude/resume";
import type { ResumeAudit } from "@/lib/resumes/audit-types";
import { writeResumePdf } from "@/lib/resumes/pdf";
import { normalizeStyle, type ResumeStyle } from "@/lib/resumes/style";
import {
  deleteMaster,
  generateForJob,
  ingestMasterFile,
  listMasters,
  reparseMaster,
  setPrimaryMaster,
  updateMasterContent,
  type IngestResult,
} from "@/lib/resumes/core";

const MAX_UPLOAD = 10 * 1024 * 1024; // 10 MB

export type UploadMasterResult =
  | {
      ok: true;
      label: string;
      chars: number;
      seededProfile: boolean;
      parse: IngestResult["parse"];
    }
  | { ok: false; error: string };

export async function uploadMasterResumeAction(
  formData: FormData,
): Promise<UploadMasterResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a file first." };
  }
  if (file.size > MAX_UPLOAD) {
    return { ok: false, error: "File too large (10 MB max)." };
  }
  if (file.name.toLowerCase().endsWith(".pdf") && !hasApiKey()) {
    return {
      ok: false,
      error: "PDF parsing needs your Anthropic key (Settings → API Keys) — or upload .md/.txt instead.",
    };
  }
  try {
    const res = await ingestMasterFile({
      filename: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    revalidatePath("/settings");
    return {
      ok: true,
      label: res.label,
      chars: res.chars,
      seededProfile: res.seededProfile,
      parse: res.parse,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export type ReparseResult =
  | {
      ok: true;
      label: string;
      chars: number;
      content: string;
      parse: NonNullable<IngestResult["parse"]>;
    }
  | { ok: false; error: string };

export async function reparseMasterAction(id: string): Promise<ReparseResult> {
  if (!hasApiKey()) {
    return { ok: false, error: "Parsing needs your Anthropic key (Settings → API Keys)." };
  }
  try {
    const res = await reparseMaster(id);
    revalidatePath("/settings");
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Re-parse failed" };
  }
}

export async function updateMasterContentAction(
  id: string,
  content: string,
): Promise<{ ok: true; chars: number } | { ok: false; error: string }> {
  try {
    await updateMasterContent(id, content);
    revalidatePath("/settings");
    return { ok: true, chars: content.trim().length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function deleteMasterResumeAction(
  id: string,
): Promise<{ ok: true }> {
  await deleteMaster(id);
  revalidatePath("/settings");
  return { ok: true };
}

export async function setPrimaryMasterAction(id: string): Promise<{ ok: true }> {
  await setPrimaryMaster(id);
  revalidatePath("/settings");
  return { ok: true };
}

// Everything the studio needs to open on a generation: the structured doc,
// its style, the fabrication audit, plus source text + JD for Edit-with-AI
// and rescoring (local single-user app — fine to hand to the client).
export type StudioPayload = {
  doc: ResumeDocType;
  style: ResumeStyle;
  audit: ResumeAudit | null;
  sourceText: string;
  jd: string;
};

export type GenerateResumeResult =
  | {
      ok: true;
      id: string;
      tailoringNote: string;
      createdAt: string;
      studio: StudioPayload;
    }
  | { ok: false; error: string };

export async function generateResumeAction(
  jobId: string,
): Promise<GenerateResumeResult> {
  if (!hasApiKey()) {
    return { ok: false, error: "Resume generation needs ANTHROPIC_API_KEY (see Settings)." };
  }
  try {
    const res = await generateForJob(jobId);
    revalidatePath(`/jobs/${jobId}`);
    return {
      ok: true,
      id: res.id,
      tailoringNote: res.tailoringNote,
      createdAt: new Date().toISOString(),
      studio: {
        doc: res.doc,
        style: normalizeStyle(null),
        audit: res.audit,
        sourceText: res.sourceText,
        jd: res.jd,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Generation failed" };
  }
}

export type LoadGeneratedResult =
  | { ok: true; studio: StudioPayload }
  | { ok: false; error: string };

// Reopen the studio on a previously generated resume (stored doc/style/audit).
export async function loadGeneratedResumeAction(
  id: string,
): Promise<LoadGeneratedResult> {
  const row = await convex().query(api.resumes.getGenerated, { id: id as never });
  if (!row) return { ok: false, error: "Generation not found." };

  let doc: ResumeDocType;
  try {
    doc = JSON.parse(row.content) as ResumeDocType;
  } catch {
    return { ok: false, error: "Stored resume is not readable." };
  }
  let audit: ResumeAudit | null = null;
  try {
    audit = row.audit ? (JSON.parse(row.audit) as ResumeAudit) : null;
  } catch {
    audit = null;
  }
  const [job, masters] = await Promise.all([
    convex().query(api.jobs.getWithCompany, { id: row.jobId }),
    listMasters(),
  ]);
  const sourceText = masters
    .map((m) => `=== MASTER RESUME: ${m.label} ===\n${m.content}`)
    .join("\n\n");

  return {
    ok: true,
    studio: {
      doc,
      style: normalizeStyle(row.style ? JSON.parse(row.style) : null),
      audit,
      sourceText,
      jd: job?.description ?? "",
    },
  };
}

export type SaveGeneratedResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Persist studio edits: doc + style JSON, plus a re-rendered PDF at the same
// path so apply-assist keeps attaching the current version.
export async function saveGeneratedResumeAction(
  id: string,
  doc: ResumeDocType,
  style: ResumeStyle,
): Promise<SaveGeneratedResult> {
  const row = await convex().query(api.resumes.getGenerated, { id: id as never });
  if (!row) return { ok: false, error: "Generation not found." };

  try {
    const pdfPath =
      row.pdfPath ?? path.join(process.cwd(), "data", "resumes", `resume-${id}.pdf`);
    await writeResumePdf(doc, normalizeStyle(style), pdfPath);
    await convex().mutation(api.resumes.patchGenerated, {
      id: id as never,
      patch: {
        content: JSON.stringify(doc),
        style: JSON.stringify(style),
        pdfPath,
        tailoringNote: doc.tailoring_note,
      },
    });
    revalidatePath(`/jobs/${row.jobId}`);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}
