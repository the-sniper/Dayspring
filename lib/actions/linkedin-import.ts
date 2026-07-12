"use server";

import { revalidatePath } from "next/cache";
import {
  confirmLinkedinImport,
  linkedinCsvToCandidates,
  type LinkedinCandidate,
  type PreparedLinkedin,
} from "@/lib/imports/linkedin";

export type LinkedinParseActionResult =
  | { ok: true; candidates: PreparedLinkedin[]; warnings: string[] }
  | { ok: false; error: string };

export async function parseLinkedinAction(
  formData: FormData,
): Promise<LinkedinParseActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose your LinkedIn Connections.csv first." };
  }
  if (file.size > 5_000_000) {
    return { ok: false, error: "File too large (5 MB max)." };
  }
  const text = await file.text();
  const { candidates, warnings } = await linkedinCsvToCandidates(text);
  return { ok: true, candidates, warnings };
}

export async function confirmLinkedinAction(
  candidates: LinkedinCandidate[],
): Promise<
  { ok: true; inserted: number; skipped: number } | { ok: false; error: string }
> {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { ok: false, error: "Nothing selected." };
  }
  const res = await confirmLinkedinImport(candidates);
  revalidatePath("/", "layout");
  return { ok: true, ...res };
}
