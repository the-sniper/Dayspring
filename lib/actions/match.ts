"use server";

import { hasApiKey } from "@/lib/claude/client";
import { extractResumeVerified, type ResumeDocType } from "@/lib/claude/resume";
import {
  analyzeMatch,
  alignResume,
  type MatchAnalysis,
} from "@/lib/claude/resume-match";
import { auditResumeDoc } from "@/lib/claude/resume-audit";
import type { ResumeAudit } from "@/lib/resumes/audit-types";
import { resolveResumeText, type ResumeSource } from "@/lib/match/core";

const NO_KEY =
  "Resume Match needs ANTHROPIC_API_KEY in .env.local (see Settings → API Keys).";
const MIN_JD_CHARS = 120;

export type AnalyzeMatchResult =
  | {
      ok: true;
      analysis: MatchAnalysis;
      resumeText: string; // handed back so the align step needs no re-upload
      resumeLabel: string;
      parseWarning: string | null;
    }
  | { ok: false; error: string };

// Analyze a resume (from a saved profile/master, or a one-off uploaded PDF)
// against a pasted job description. Uploads are parsed transiently and never
// saved to the master library.
export async function analyzeResumeMatchAction(
  formData: FormData,
): Promise<AnalyzeMatchResult> {
  if (!await hasApiKey()) return { ok: false, error: NO_KEY };

  const jd = String(formData.get("jd") ?? "").trim();
  if (jd.length < MIN_JD_CHARS) {
    return {
      ok: false,
      error: "Paste a fuller job description (at least ~120 characters).",
    };
  }

  const source = String(formData.get("source") ?? "");

  try {
    let resumeText: string;
    let resumeLabel: string;
    let parseWarning: string | null = null;

    if (source === "upload") {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return { ok: false, error: "Choose a PDF resume to upload." };
      }
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        return {
          ok: false,
          error: "Upload a PDF (export a DOCX to PDF first).",
        };
      }
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const parsed = await extractResumeVerified(base64);
      resumeText = parsed.markdown;
      resumeLabel = file.name.replace(/\.pdf$/i, "");
      if (!parsed.faithful && parsed.problems.length) {
        parseWarning = `Parsed with ${parsed.problems.length} possible fidelity issue${
          parsed.problems.length === 1 ? "" : "s"
        } — analysis is based on the extracted text.`;
      }
    } else {
      const [kind, id] = source.split(":");
      if ((kind !== "profile" && kind !== "master") || !id) {
        return { ok: false, error: "Choose a resume to analyze." };
      }
      const resolved = await resolveResumeText({ kind, id } as ResumeSource);
      if (!resolved) return { ok: false, error: "That resume could not be found." };
      resumeText = resolved.text;
      resumeLabel = resolved.label;
    }

    if (!resumeText.trim()) {
      return { ok: false, error: "That resume appears to be empty." };
    }

    const { analysis } = await analyzeMatch(resumeText, jd);
    return { ok: true, analysis, resumeText, resumeLabel, parseWarning };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Analysis failed.",
    };
  }
}

export type AlignMatchResult =
  | { ok: true; doc: ResumeDocType; audit: ResumeAudit | null; note: string }
  | { ok: false; error: string };

// Regenerate an improved, JD-aligned resume from the same resume text, honoring
// the sections/keywords the user chose. Returns the structured doc plus its
// fabrication audit — the studio previews and downloads entirely client-side,
// so nothing transient touches disk anymore.
export async function alignResumeMatchAction(input: {
  jd: string;
  resumeText: string;
  sections: string[];
  keywords: string[];
  title?: string | null;
}): Promise<AlignMatchResult> {
  if (!await hasApiKey()) return { ok: false, error: NO_KEY };
  if (!input.resumeText?.trim()) {
    return { ok: false, error: "Run the analysis first." };
  }
  if (!input.jd?.trim()) {
    return { ok: false, error: "The job description is missing." };
  }

  try {
    const { doc } = await alignResume(input.resumeText, input.jd, {
      sections: input.sections ?? [],
      keywords: input.keywords ?? [],
      title: input.title ?? null,
    });
    let audit: ResumeAudit | null = null;
    try {
      audit = await auditResumeDoc(input.resumeText, doc);
    } catch {
      audit = null;
    }
    return { ok: true, doc, audit, note: doc.tailoring_note };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Alignment failed.",
    };
  }
}
