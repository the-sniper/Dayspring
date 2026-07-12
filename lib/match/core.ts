// Orchestration for the standalone Resume Match tool. Resolves the chosen
// resume's text from a profile or master (uploads are parsed in the action and
// never persisted). Aligned resumes are previewed/downloaded client-side by
// the studio — no transient files on disk.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { masterResumes, profiles } from "@/lib/db/schema";
import { profileText } from "@/lib/profiles/core";

export type ResumeSource =
  | { kind: "profile"; id: number }
  | { kind: "master"; id: number };

// Resume text for the AI, from a saved profile or master resume. Uploads are
// handled separately (parsed to markdown in the action) and passed through.
export function resolveResumeText(
  src: ResumeSource,
): { text: string; label: string } | null {
  if (src.kind === "profile") {
    const p = db.select().from(profiles).where(eq(profiles.id, src.id)).get();
    if (!p) return null;
    return { text: profileText(p), label: p.name };
  }
  const m = db
    .select()
    .from(masterResumes)
    .where(eq(masterResumes.id, src.id))
    .get();
  if (!m) return null;
  return { text: m.content, label: m.label };
}
