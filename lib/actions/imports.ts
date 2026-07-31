"use server";

import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import { parsePaste } from "@/lib/claude/parse-paste";
import { confirmImport, flagDuplicates, type PreparedCandidate } from "@/lib/imports/candidates";
import { csvToCandidates } from "@/lib/imports/csv";
import { keyMessages } from "@/lib/keys/messages";
import { CandidateJobSchema, type JobSource } from "@/lib/types";

export type ParseActionResult =
  | {
      ok: true;
      candidates: PreparedCandidate[];
      warnings: string[];
      source: JobSource;
    }
  | { ok: false; error: string };

export async function parseCsvAction(
  formData: FormData,
): Promise<ParseActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV file first." };
  }
  if (file.size > 2_000_000) {
    return { ok: false, error: "File too large (2 MB max)." };
  }
  const text = await file.text();
  const { candidates, warnings, unmappedHeaders } = csvToCandidates(text);
  const allWarnings = [...warnings];
  if (unmappedHeaders.length) {
    allWarnings.push(`Ignored columns: ${unmappedHeaders.join(", ")}`);
  }
  return {
    ok: true,
    candidates: await flagDuplicates(candidates),
    warnings: allWarnings,
    source: "csv",
  };
}

export async function parsePasteAction(
  text: string,
): Promise<ParseActionResult> {
  if (!text.trim()) return { ok: false, error: "Paste some text first." };
  if (!await hasApiKey()) {
    return {
      ok: false,
      error: keyMessages.pasteParse,
    };
  }
  try {
    const { jobs, truncated } = await parsePaste(text);
    const warnings: string[] = [];
    if (truncated) warnings.push("Input was over 20K characters — extra text was ignored.");
    if (jobs.length === 0) warnings.push("No job postings found in the pasted text.");
    return {
      ok: true,
      candidates: await flagDuplicates(jobs),
      warnings,
      source: "paste",
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Parsing failed." };
  }
}

export async function confirmImportAction(
  candidates: unknown,
  source: JobSource,
): Promise<{ ok: true; inserted: number; skipped: number } | { ok: false; error: string }> {
  const parsed = CandidateJobSchema.array().safeParse(candidates);
  if (!parsed.success) return { ok: false, error: "Invalid candidate data." };
  const res = await confirmImport(parsed.data, source);
  revalidatePath("/", "layout");
  return { ok: true, ...res };
}
