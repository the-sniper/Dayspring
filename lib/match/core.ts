// Orchestration for the standalone Resume Match tool. Resolves the chosen
// resume's text from a profile or master (uploads are parsed in the action and
// never persisted). Aligned resumes are previewed/downloaded client-side by
// the studio — no transient files on disk.
import { api, convex } from "@/lib/convex/server";
import { profileText, type ProfileRow } from "@/lib/profiles/core";

export type ResumeSource =
  | { kind: "profile"; id: string }
  | { kind: "master"; id: string };

// Resume text for the AI, from a saved profile or master resume. Uploads are
// handled separately (parsed to markdown in the action) and passed through.
export async function resolveResumeText(
  src: ResumeSource,
): Promise<{ text: string; label: string } | null> {
  if (src.kind === "profile") {
    const p = await convex().query(api.profiles.getById, { id: src.id as never });
    if (!p) return null;
    return { text: profileText({ ...p, id: p._id } as unknown as ProfileRow), label: p.name };
  }
  const m = await convex().query(api.resumes.getMaster, { id: src.id as never });
  if (!m) return null;
  return { text: m.content, label: m.label };
}
