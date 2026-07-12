// Immutable helpers for editing a ResumeDocType by audit path
// ("summary", "experience.0.bullets.2", "skills.1.items.0", ...).
// Audit findings can go stale after edits shift array indices, so destructive
// operations locate items by their exact text first (locateText) and fall back
// to the recorded path.
import type { ResumeDocType } from "@/lib/claude/resume";

type AnyObj = Record<string, unknown>;

function clone(doc: ResumeDocType): ResumeDocType {
  return JSON.parse(JSON.stringify(doc)) as ResumeDocType;
}

function walk(doc: AnyObj, segments: string[]): { parent: unknown; key: string | number } | null {
  let node: unknown = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    if (node == null || typeof node !== "object") return null;
    node = (node as AnyObj)[segments[i]];
  }
  if (node == null || typeof node !== "object") return null;
  const last = segments[segments.length - 1];
  const key = Array.isArray(node) ? Number(last) : last;
  if (Array.isArray(node) && (!Number.isInteger(key) || (key as number) < 0 || (key as number) >= node.length)) {
    return null;
  }
  return { parent: node, key };
}

export function getAtPath(doc: ResumeDocType, path: string): string | null {
  const hit = walk(doc as unknown as AnyObj, path.split("."));
  if (!hit) return null;
  const v = Array.isArray(hit.parent)
    ? hit.parent[hit.key as number]
    : (hit.parent as AnyObj)[hit.key as string];
  return typeof v === "string" ? v : null;
}

export function setAtPath(doc: ResumeDocType, path: string, value: string): ResumeDocType {
  const next = clone(doc);
  const hit = walk(next as unknown as AnyObj, path.split("."));
  if (!hit) return next;
  if (Array.isArray(hit.parent)) hit.parent[hit.key as number] = value;
  else (hit.parent as AnyObj)[hit.key as string] = value;
  return next;
}

// Delete the item at path: array leaves are spliced out; nullable string
// fields (headline, summary, blurb, detail) are nulled.
export function deleteAtPath(doc: ResumeDocType, path: string): ResumeDocType {
  const next = clone(doc);
  const hit = walk(next as unknown as AnyObj, path.split("."));
  if (!hit) return next;
  if (Array.isArray(hit.parent)) {
    hit.parent.splice(hit.key as number, 1);
  } else {
    (hit.parent as AnyObj)[hit.key as string] = null;
  }
  // Drop skill groups that just lost their last item.
  next.skills = next.skills.filter((g) => g.items.length > 0);
  return next;
}

// Find the CURRENT path of an item by its exact text — resilient to index
// drift after other deletions. Returns null if the text no longer exists.
export function locateText(doc: ResumeDocType, text: string): string | null {
  const t = text.trim();
  if (doc.headline?.trim() === t) return "headline";
  if (doc.summary?.trim() === t) return "summary";
  for (let i = 0; i < doc.experience.length; i++) {
    const e = doc.experience[i];
    if (e.dates.trim() === t) return `experience.${i}.dates`;
    for (let j = 0; j < e.bullets.length; j++) {
      if (e.bullets[j].trim() === t) return `experience.${i}.bullets.${j}`;
    }
  }
  for (let i = 0; i < doc.projects.length; i++) {
    const p = doc.projects[i];
    if (p.blurb?.trim() === t) return `projects.${i}.blurb`;
    for (let j = 0; j < p.bullets.length; j++) {
      if (p.bullets[j].trim() === t) return `projects.${i}.bullets.${j}`;
    }
  }
  for (let g = 0; g < doc.skills.length; g++) {
    for (let s = 0; s < doc.skills[g].items.length; s++) {
      if (doc.skills[g].items[s].trim() === t) return `skills.${g}.items.${s}`;
    }
  }
  for (let i = 0; i < doc.education.length; i++) {
    if (doc.education[i].detail?.trim() === t) return `education.${i}.detail`;
  }
  return null;
}

// Human-readable location for a finding path, e.g. "Work Experience · Stripe".
export function describePath(doc: ResumeDocType, path: string): string {
  const seg = path.split(".");
  switch (seg[0]) {
    case "headline":
      return "Headline";
    case "summary":
      return "Summary";
    case "experience": {
      const e = doc.experience[Number(seg[1])];
      const where = e ? ` · ${e.company}` : "";
      return seg[2] === "dates" ? `Dates${where}` : `Work Experience${where}`;
    }
    case "projects": {
      const p = doc.projects[Number(seg[1])];
      return `Project${p ? ` · ${p.name}` : ""}`;
    }
    case "skills": {
      const g = doc.skills[Number(seg[1])];
      return `Skills${g ? ` · ${g.group}` : ""}`;
    }
    case "education":
      return "Education";
    default:
      return path;
  }
}
