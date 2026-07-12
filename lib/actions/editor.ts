"use server";

// Studio actions shared by both entry points (per-job Resume Studio and the
// Resume Match tool): Edit-with-AI (re-audited every pass) and rescoring.
import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";
import { hasOpenAIKey } from "@/lib/ai/openai";
import { hasApiKey } from "@/lib/claude/client";
import { editResume, type ResumeDocType } from "@/lib/claude/resume";
import { auditResumeDoc } from "@/lib/claude/resume-audit";
import { analyzeMatch, type MatchAnalysis } from "@/lib/claude/resume-match";
import type { ResumeAudit } from "@/lib/resumes/audit-types";

const NO_KEY = "This needs ANTHROPIC_API_KEY (see Settings → API Keys).";

export type AiEditResult =
  | { ok: true; doc: ResumeDocType; note: string }
  | { ok: false; error: string };

// Apply an instruction and return the doc immediately. The fabrication audit is
// a SEPARATE call (auditResumeAction) so the client can run it in parallel with
// the rescore instead of chaining three slow model calls back-to-back.
export async function aiEditResumeAction(input: {
  doc: ResumeDocType;
  sourceText: string;
  jd?: string | null;
  instruction: string;
}): Promise<AiEditResult> {
  if (!hasApiKey()) return { ok: false, error: NO_KEY };
  if (!input.instruction?.trim()) {
    return { ok: false, error: "Tell the AI what to change first." };
  }
  try {
    const { doc } = await editResume(input);
    return { ok: true, doc, note: doc.tailoring_note };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Edit failed." };
  }
}

export type AuditResult =
  | { ok: true; audit: ResumeAudit | null }
  | { ok: false; error: string };

export async function auditResumeAction(input: {
  sourceText: string;
  doc: ResumeDocType;
}): Promise<AuditResult> {
  if (!hasApiKey()) return { ok: false, error: NO_KEY };
  try {
    const audit = await auditResumeDoc(input.sourceText, input.doc);
    return { ok: true, audit };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Audit failed." };
  }
}

// Flatten the structured doc to plain text so the match analyzer can score the
// edited resume exactly like it scores raw resume text.
function docToText(doc: ResumeDocType): string {
  const lines: string[] = [doc.name];
  if (doc.headline) lines.push(doc.headline);
  const contact = [
    doc.contact.email,
    doc.contact.phone,
    doc.contact.location,
    doc.contact.linkedin,
    doc.contact.website,
  ].filter(Boolean);
  if (contact.length) lines.push(contact.join(" · "));
  if (doc.summary) lines.push("", "SUMMARY", doc.summary);
  if (doc.skills.length) {
    lines.push("", "SKILLS");
    for (const g of doc.skills) lines.push(`${g.group}: ${g.items.join(", ")}`);
  }
  if (doc.experience.length) {
    lines.push("", "WORK EXPERIENCE");
    for (const e of doc.experience) {
      lines.push(
        `${e.title} — ${e.company}${e.location ? `, ${e.location}` : ""} (${e.dates})`,
      );
      for (const b of e.bullets) lines.push(`- ${b}`);
    }
  }
  if (doc.projects.length) {
    lines.push("", "PROJECTS");
    for (const p of doc.projects) {
      lines.push(`${p.name}${p.blurb ? ` — ${p.blurb}` : ""}`);
      for (const b of p.bullets) lines.push(`- ${b}`);
    }
  }
  if (doc.education.length) {
    lines.push("", "EDUCATION");
    for (const e of doc.education) {
      lines.push(
        `${e.school}${e.degree ? ` — ${e.degree}` : ""}${e.dates ? ` (${e.dates})` : ""}`,
      );
      if (e.detail) lines.push(e.detail);
    }
  }
  return lines.join("\n");
}

// Pick the best Skills-section bucket for a single keyword. Fast + cheap (routes
// to the OpenAI cost tier when available, else Claude Haiku) so adding a skill
// feels instant. Returns an existing group name when one fits, otherwise a
// concise conventional new group name.
const SkillCategory = z.object({ group: z.string() });

export type CategorizeSkillResult =
  | { ok: true; group: string }
  | { ok: false; error: string };

export async function categorizeSkillAction(input: {
  keyword: string;
  groups: string[];
}): Promise<CategorizeSkillResult> {
  if (!hasApiKey() && !hasOpenAIKey()) return { ok: false, error: NO_KEY };
  const keyword = input.keyword?.trim();
  if (!keyword) return { ok: false, error: "No keyword provided." };
  const groups = (input.groups ?? []).map((g) => g.trim()).filter(Boolean);
  try {
    const { data } = await structuredComplete({
      tier: "cheap",
      schema: SkillCategory,
      schemaName: "skill_category",
      maxTokens: 200,
      system:
        `You place ONE skill into the best category bucket of a resume's Skills section. ` +
        `Given the skill and the candidate's EXISTING group names, return the name of the existing group it best belongs to — copied EXACTLY. ` +
        `Only if none is a reasonable fit, return a concise, conventional new group name (e.g. "Programming Languages", "Cloud & DevOps", "Tools & Platforms", "Methodologies"). ` +
        `Return just the group name.`,
      user: `SKILL: ${keyword}\n\nEXISTING GROUPS:\n${
        groups.length ? groups.map((g) => `- ${g}`).join("\n") : "(none yet)"
      }`,
    });
    const group = data.group?.trim();
    return { ok: true, group: group || groups[0] || "Skills" };
  } catch (err) {
    // Non-fatal: fall back to the first existing group client-side.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Categorization failed.",
    };
  }
}

export type RescoreResult =
  | { ok: true; analysis: MatchAnalysis }
  | { ok: false; error: string };

export async function rescoreResumeAction(input: {
  doc: ResumeDocType;
  jd: string;
}): Promise<RescoreResult> {
  if (!hasApiKey()) return { ok: false, error: NO_KEY };
  if (!input.jd?.trim()) {
    return { ok: false, error: "No job description to score against." };
  }
  try {
    const { analysis } = await analyzeMatch(docToText(input.doc), input.jd);
    return { ok: true, analysis };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Rescore failed." };
  }
}
