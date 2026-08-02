"use server";

import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import { hasOpenAIKey } from "@/lib/ai/openai";
import { SETTINGS_API_KEYS } from "@/lib/keys/messages";
import type { LengthMode, TailoredLatexType } from "@/lib/claude/latex-resume";
import {
  KNOWLEDGE_BASE_KIND,
  LATEX_TEMPLATE_KIND,
  assetSummary,
  generateLatexForJob,
  getAsset,
  getDefaultLengthMode,
  latexReadiness,
  recompileStoredLatex,
  saveAsset,
  setDefaultLengthMode,
} from "@/lib/resumes/latex-core";

const MAX_ASSET = 2 * 1024 * 1024; // 2 MB — a knowledge base is text, not a PDF

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function isAssetKind(kind: string): boolean {
  return kind === LATEX_TEMPLATE_KIND || kind === KNOWLEDGE_BASE_KIND;
}

export async function saveResumeAssetAction(
  kind: string,
  content: string,
  label?: string,
): Promise<Result<{ chars: number }>> {
  if (!isAssetKind(kind)) return { ok: false, error: "Unknown asset kind." };
  if (!content.trim()) return { ok: false, error: "Nothing to save." };
  if (content.length > MAX_ASSET) {
    return { ok: false, error: `Too large (${Math.round(content.length / 1024)} KB, max 2 MB).` };
  }
  if (kind === LATEX_TEMPLATE_KIND && !/\\documentclass/.test(content)) {
    return {
      ok: false,
      error: "That doesn't look like a full LaTeX document — it needs a \\documentclass line.",
    };
  }
  await saveAsset(kind, content, label);
  revalidatePath("/settings");
  return { ok: true, chars: content.length };
}

export async function uploadResumeAssetAction(
  formData: FormData,
): Promise<Result<{ chars: number; kind: string }>> {
  const kind = String(formData.get("kind") ?? "");
  const file = formData.get("file");
  if (!isAssetKind(kind)) return { ok: false, error: "Unknown asset kind." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a file first." };
  if (file.size > MAX_ASSET) return { ok: false, error: "File is over the 2 MB limit." };
  const content = await file.text();
  const saved = await saveResumeAssetAction(kind, content, file.name);
  return saved.ok ? { ok: true, chars: saved.chars, kind } : saved;
}

export async function getResumeAssetAction(
  kind: string,
): Promise<Result<{ content: string; label: string | null }>> {
  if (!isAssetKind(kind)) return { ok: false, error: "Unknown asset kind." };
  const row = await getAsset(kind);
  return { ok: true, content: row?.content ?? "", label: row?.label ?? null };
}

export async function resumeAssetsStatusAction() {
  const [assets, readiness, lengthMode] = await Promise.all([
    assetSummary(),
    latexReadiness(),
    getDefaultLengthMode(),
  ]);
  return { assets, readiness, lengthMode };
}

export async function setDefaultLengthModeAction(mode: LengthMode): Promise<{ ok: true }> {
  await setDefaultLengthMode(mode);
  revalidatePath("/settings");
  return { ok: true };
}

export type LatexTailorResult = Result<{
  id: string | null;
  latex: string;
  result: TailoredLatexType;
  pages: number | null;
  compileError: string | null;
  lengthMode: LengthMode;
  attempts: number;
}>;

export async function generateLatexResumeAction(
  jobId: string,
  lengthMode?: LengthMode,
): Promise<LatexTailorResult> {
  if (!(await hasApiKey()) && !(await hasOpenAIKey())) {
    return { ok: false, error: SETTINGS_API_KEYS };
  }
  try {
    const res = await generateLatexForJob(jobId, { lengthMode });
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tailoring failed" };
  }
}

export async function recompileLatexAction(
  generatedId: string,
  latex: string,
): Promise<Result<{ pages: number | null }>> {
  try {
    const res = await recompileStoredLatex(generatedId, latex);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, pages: res.pages };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Compile failed" };
  }
}
