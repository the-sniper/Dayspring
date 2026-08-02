// Turn a raw LinkedIn post into structured hiring facts: is this actually a job
// announcement, and if so which company, which titles, where, and where do you
// apply. One cheap batched call, same shape as lib/claude/classify-roles.ts.
import { z } from "zod";
import { structuredComplete } from "@/lib/ai/complete";
import type { LinkedinPost } from "@/lib/integrations/linkedin/posts";
import {
  applyLinkCandidates,
  pickApplyLink,
} from "@/shared/linkedin-posts";

export const EXTRACT_BATCH_LIMIT = 15;

const Extraction = z.object({
  posts: z.array(
    z.object({
      index: z.number(),
      is_hiring: z.boolean(),
      // Are the OPENINGS in the United States? Affirmative evidence required —
      // a bare "Remote" is not a yes. See shared/us-location.ts.
      in_us: z.boolean(),
      company: z.string(),
      titles: z.array(z.string()),
      location: z.string(),
      // Index into the numbered link list given for that post, or -1 for none.
      // The model picks from links we found — it never writes a URL.
      link_index: z.number(),
    }),
  ),
});

export type PostExtraction = {
  isHiring: boolean;
  inUs: boolean;
  companyName: string | null;
  roleTitles: string[];
  location: string | null;
  jobUrl: string | null;
};

// Re-export so callers that already import from this module keep working.
export { applyLinkCandidates, pickApplyLink };

const SYSTEM = `You read LinkedIn posts and decide whether each one announces a specific open job.

is_hiring = true ONLY for posts announcing open role(s) someone can apply to right now: "we're hiring", "my team has an opening", a recruiter listing roles, a laid-off-friends referral post naming open reqs.
is_hiring = false for: someone announcing they are looking FOR a job, congratulations/new-job posts, general career advice, hiring-process commentary, company milestones, event promos, courses, and engagement bait.

company: the hiring company's name, "" if not stated. Never guess from the author's headline unless it clearly is the hiring company.
titles: the specific role titles named in the post, verbatim and deduplicated. [] if the post is vague ("multiple engineering roles").
location: the role's location as written ("Remote — US", "NYC"), "" if not stated.
in_us: true ONLY when the post gives positive evidence the OPENINGS are in the United States — a US city or state, "United States"/"US"/"USA", "US-based", "Remote (US)", a US time-zone requirement (EST/PST/CST), or US work-authorization language (H1B, OPT, green card). If the post lists several regions and one of them is the US, that is true.
in_us = false for: a bare "Remote" with no country anywhere, no location at all, or a location that is somewhere other than the US. Do NOT infer the US from the author being on LinkedIn, from the post being in English, or from a company having US customers. An offshore staffing post listing many unrelated roles (engineering AND sales AND marketing AND HR) with no country named is false.
link_index: from the numbered LINKS list for that post, the index of the application link. LinkedIn short links (lnkd.in/…) ARE application links — pick them. Use -1 when the list is empty or no link is an application link. NEVER invent a URL and never guess an index that is not listed.

Return exactly one object per input index.`;

// ── US-only re-triage for posts already in the table ─────────────────────────
// Rows pulled before the US filter existed have text and location but no
// in_us judgment. Re-running the full extraction on them would re-derive
// company, titles and links that are already stored, so this asks the one
// question that's actually missing.
const UsOnly = z.object({
  posts: z.array(z.object({ index: z.number(), in_us: z.boolean() })),
});

const US_SYSTEM = `For each hiring post, decide whether the OPENINGS are in the United States.

in_us = true ONLY with positive evidence: a US city or state, "United States"/"US"/"USA", "US-based", "Remote (US)", a US time-zone requirement (EST/PST/CST), or US work-authorization language (H1B, OPT, green card). If several regions are listed and one is the US, that is true.
in_us = false for: a bare "Remote" with no country anywhere, no location at all, or a location outside the US. Never infer the US from the post being in English, from the author's presence on LinkedIn, or from the company having US customers. An offshore staffing post listing many unrelated roles across engineering, sales, marketing and HR with no country named is false.

Return exactly one object per input index.`;

export async function classifyUsBatch(
  posts: { text: string; location?: string | null }[],
): Promise<(boolean | null)[]> {
  const batch = posts.slice(0, EXTRACT_BATCH_LIMIT);
  const { data } = await structuredComplete({
    tier: "cheap",
    schema: UsOnly,
    schemaName: "linkedin_post_us_only",
    maxTokens: 1000,
    system: US_SYSTEM,
    user: batch
      .map((p, i) =>
        [
          `POST ${i}`,
          `LOCATION: ${p.location?.trim() || "(not stated)"}`,
          `TEXT: ${p.text.slice(0, 2500)}`,
        ].join("\n"),
      )
      .join("\n\n---\n\n"),
  });
  const out: (boolean | null)[] = batch.map(() => null);
  for (const p of data.posts) {
    if (p.index >= 0 && p.index < batch.length) out[p.index] = p.in_us;
  }
  return out;
}

function promptFor(posts: LinkedinPost[], candidates: string[][]): string {
  return posts
    .map((p, i) => {
      const links = candidates[i];
      const linkBlock =
        links.length > 0
          ? links.map((u, li) => `  ${li}: ${u}`).join("\n")
          : "  (none)";
      // Author headline is included because posts often say "my team" and only
      // the headline names the company.
      return [
        `POST ${i}`,
        `AUTHOR: ${p.authorName}${p.authorHeadline ? ` — ${p.authorHeadline}` : ""}`,
        `TEXT: ${p.text}`,
        `LINKS:`,
        linkBlock,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

// Extract one batch. Returns null entries for indexes the model omitted so the
// caller can fall back to storing the post unextracted.
export async function extractPosts(
  posts: LinkedinPost[],
): Promise<(PostExtraction | null)[]> {
  const batch = posts.slice(0, EXTRACT_BATCH_LIMIT);
  const candidates = batch.map((p) => applyLinkCandidates(p.text));

  const { data } = await structuredComplete({
    tier: "cheap",
    schema: Extraction,
    schemaName: "linkedin_post_extraction",
    maxTokens: 4000,
    system: SYSTEM,
    user: promptFor(batch, candidates),
  });

  const out: (PostExtraction | null)[] = batch.map(() => null);
  for (const p of data.posts) {
    if (p.index < 0 || p.index >= batch.length) continue;
    const text = batch[p.index].text;
    // Model pick when valid; otherwise deterministic fallback for clear apply
    // links (especially lnkd.in) so "Apply here:" URLs are not dropped.
    const jobUrl = pickApplyLink(text, p.link_index);
    out[p.index] = {
      isHiring: p.is_hiring,
      inUs: p.in_us,
      companyName: p.company.trim() || null,
      roleTitles: [...new Set(p.titles.map((t) => t.trim()).filter(Boolean))],
      location: p.location.trim() || null,
      jobUrl,
    };
  }
  return out;
}
