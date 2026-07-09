"use server";

import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import {
  deleteMaster,
  generateForJob,
  ingestMasterFile,
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

export async function reparseMasterAction(id: number): Promise<ReparseResult> {
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
  id: number,
  content: string,
): Promise<{ ok: true; chars: number } | { ok: false; error: string }> {
  try {
    updateMasterContent(id, content);
    revalidatePath("/settings");
    return { ok: true, chars: content.trim().length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function deleteMasterResumeAction(
  id: number,
): Promise<{ ok: true }> {
  deleteMaster(id);
  revalidatePath("/settings");
  return { ok: true };
}

export async function setPrimaryMasterAction(id: number): Promise<{ ok: true }> {
  setPrimaryMaster(id);
  revalidatePath("/settings");
  return { ok: true };
}

export type GenerateResumeResult =
  | { ok: true; id: number; tailoringNote: string; createdAt: string }
  | { ok: false; error: string };

export async function generateResumeAction(
  jobId: number,
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
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Generation failed" };
  }
}
