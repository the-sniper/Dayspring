"use server";

import { revalidatePath } from "next/cache";
import { hasApiKey } from "@/lib/claude/client";
import {
  ConsolidatedDocSchema,
  consolidateResumes,
  type ConsolidatedDoc,
} from "@/lib/claude/consolidate";
import type { ApplicationDefaults } from "@/lib/db/schema";
import {
  createProfile,
  deleteProfile,
  docToMarkdown,
  setDefaultProfile,
  updateProfile,
} from "@/lib/profiles/core";
import { listMasters } from "@/lib/resumes/core";

export async function createProfileAction(
  name: string,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (!name.trim()) return { ok: false, error: "Give the profile a name." };
  const id = createProfile(name);
  setDefaultProfile(id); // the switcher selects it immediately
  revalidatePath("/profile");
  return { ok: true, id };
}

export async function setDefaultProfileAction(id: number): Promise<{ ok: true }> {
  setDefaultProfile(id);
  revalidatePath("/", "layout"); // scoring/tailoring/apply all read the default
  return { ok: true };
}

export async function deleteProfileAction(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = deleteProfile(id);
  if (res.ok) revalidatePath("/profile");
  return res;
}

export async function updateProfileHeaderAction(
  id: number,
  fields: {
    name?: string;
    fullName?: string;
    headline?: string;
    summary?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    website?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const clean = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]),
    );
    if (clean.name === null) delete clean.name; // profile name can't be empty
    updateProfile(id, clean);
    revalidatePath("/profile");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function updateProfileDefaultsAction(
  id: number,
  defaults: ApplicationDefaults,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    updateProfile(id, { defaults });
    revalidatePath("/profile");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function updateProfileContentAction(
  id: number,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!content.trim()) return { ok: false, error: "Content can't be empty." };
  updateProfile(id, { content: content.trim() });
  revalidatePath("/profile");
  return { ok: true };
}

// Consolidate ALL master resumes → one canonical doc. Preview-first: nothing
// is written until the human applies it.
export type ConsolidateResult =
  | { ok: true; doc: ConsolidatedDoc; markdown: string; sources: number }
  | { ok: false; error: string };

export async function consolidateAction(): Promise<ConsolidateResult> {
  if (!hasApiKey()) {
    return { ok: false, error: "Consolidation needs your Anthropic key (Settings → API Keys)." };
  }
  const masters = listMasters();
  if (masters.length === 0) {
    return { ok: false, error: "Upload at least one master resume in Settings first." };
  }
  try {
    const { doc } = await consolidateResumes(
      masters.map((m) => ({ label: m.label, content: m.content })),
    );
    return { ok: true, doc, markdown: docToMarkdown(doc), sources: masters.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Consolidation failed" };
  }
}

// Per-card structured edits (M28): the doc is canonical — every save also
// regenerates the markdown corpus so scoring/tailoring read the same facts.
export async function updateProfileDocAction(
  profileId: number,
  doc: ConsolidatedDoc,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ConsolidatedDocSchema.safeParse(doc);
  if (!parsed.success) {
    return { ok: false, error: "That edit didn't validate — refresh and try again." };
  }
  // Drop entries emptied out in the editor rather than saving blanks.
  const clean: ConsolidatedDoc = {
    ...parsed.data,
    experience: parsed.data.experience
      .filter((e) => e.company.trim() || e.title.trim())
      .map((e) => ({ ...e, bullets: e.bullets.map((b) => b.trim()).filter(Boolean) })),
    projects: parsed.data.projects
      .filter((p) => p.name.trim())
      .map((p) => ({ ...p, bullets: p.bullets.map((b) => b.trim()).filter(Boolean) })),
    education: parsed.data.education.filter((e) => e.school.trim()),
    skills: parsed.data.skills
      .filter((g) => g.group.trim() && g.items.some((i) => i.trim()))
      .map((g) => ({ ...g, items: g.items.map((i) => i.trim()).filter(Boolean) })),
    certifications: parsed.data.certifications.filter((c) => c.name.trim()),
  };
  try {
    updateProfile(profileId, { doc: clean, content: docToMarkdown(clean) });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

// Write a consolidation into a profile: content + structured doc + any header
// fields the doc carries (doc values win — they came from the user's resumes).
export async function applyConsolidationAction(
  profileId: number,
  doc: ConsolidatedDoc,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    updateProfile(profileId, {
      content: docToMarkdown(doc),
      doc,
      fullName: doc.name || undefined,
      headline: doc.headline,
      summary: doc.summary,
      email: doc.contact.email,
      phone: doc.contact.phone,
      location: doc.contact.location,
      linkedin: doc.contact.linkedin,
      github: doc.contact.github,
      website: doc.contact.website,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Apply failed" };
  }
}
