// Orchestra handoff types + honest-status envelope (Next-free, shared by
// lib/orchestra/run.ts, scripts/orchestra.ts, and the eval runner).
import { z } from "zod";

export const HONEST_STATUSES = [
  "complete",
  "partial",
  "blocked",
  "low_confidence",
] as const;

export const Citation = z.object({ title: z.string(), url: z.string() });
export type Citation = z.infer<typeof Citation>;

// Every deliverable ends with this envelope as a fenced ```json block. The
// parser (extractEnvelope) pulls the LAST fenced json block from the output —
// prose before it is the artifact body.
export const Envelope = z.object({
  status: z.enum(HONEST_STATUSES),
  summary: z.string().min(1),
  // What's missing / why blocked / which claims are shaky. Required to be
  // present (possibly empty) so "complete" is an explicit assertion, not a
  // default.
  missing: z.array(z.string()),
  uncertainties: z.array(z.string()),
});
export type Envelope = z.infer<typeof Envelope>;

export const AtlasPlan = Envelope.extend({
  radarObjective: z.string().min(1),
  definitionOfDone: z.array(z.string()).min(1).max(6),
  focusAreas: z.array(z.string()).max(5),
});
export type AtlasPlan = z.infer<typeof AtlasPlan>;

export const SentinelVerdict = Envelope.extend({
  verdict: z.enum(["confirmed", "needs_work", "refuted"]),
  checkedClaims: z.array(
    z.object({
      claim: z.string(),
      holds: z.boolean(),
      note: z.string(),
    }),
  ),
  incidents: z.array(
    z.object({
      kind: z.enum([
        "unsourced_claim",
        "hallucination",
        "dod_unmet",
        "other",
      ]),
      severity: z.enum(["low", "medium", "high"]),
      detail: z.string(),
    }),
  ),
});
export type SentinelVerdict = z.infer<typeof SentinelVerdict>;

// Pull the last ```json fenced block out of a model reply and validate it.
// Never throws — callers decide whether to retry with the zod error injected.
export type EnvelopeResult<T> =
  | { ok: true; data: T; body: string }
  | { ok: false; error: string };

// Fallback for un-fenced replies: the last balanced {...} in the text.
// (Braces inside JSON strings can defeat the scan — acceptable for a fallback;
// the fenced path is the contract.)
function lastJsonObject(text: string): { raw: string; index: number } | null {
  const end = text.lastIndexOf("}");
  if (end === -1) return null;
  let depth = 0;
  for (let i = end; i >= 0; i--) {
    const ch = text[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      depth--;
      if (depth === 0) return { raw: text.slice(i, end + 1), index: i };
    }
  }
  return null;
}

export function extractEnvelope<T>(
  text: string,
  schema: z.ZodType<T>,
): EnvelopeResult<T> {
  // Candidates in preference order: last ```json fence, last generic ```
  // fence containing an object, last bare trailing {...}. First incident
  // (2026-08-01, atlas parse_failure) was a raw-JSON reply the fence-only
  // parser rejected — hence the fallbacks.
  const candidates: { raw: string; index: number }[] = [];
  const jsonFences = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const lastJson = jsonFences[jsonFences.length - 1];
  if (lastJson) candidates.push({ raw: lastJson[1], index: lastJson.index ?? 0 });
  const anyFences = [...text.matchAll(/```\w*\s*([\s\S]*?)```/g)].filter((m) =>
    m[1].trimStart().startsWith("{"),
  );
  const lastAny = anyFences[anyFences.length - 1];
  if (lastAny) candidates.push({ raw: lastAny[1], index: lastAny.index ?? 0 });
  const bare = lastJsonObject(text);
  if (bare) candidates.push(bare);

  if (!candidates.length) {
    return { ok: false, error: "No JSON envelope found (fenced or bare)." };
  }
  let lastError = "";
  for (const c of candidates) {
    try {
      const parsed: unknown = JSON.parse(c.raw);
      const result = schema.safeParse(parsed);
      if (!result.success) {
        lastError = result.error.message;
        continue;
      }
      const body = text.slice(0, c.index).trim();
      return { ok: true, data: result.data, body };
    } catch (err) {
      lastError = `Envelope is not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return { ok: false, error: lastError };
}

export const CompassPlan = Envelope.extend({
  // 0-2 angles; zero = "nothing worth posting today" (a valid decision).
  angles: z
    .array(
      z.object({
        platform: z.enum(["x", "linkedin"]),
        angle: z.string().min(1),
        why: z.string().min(1),
        sourceUrls: z.array(z.string()),
      }),
    )
    .max(2),
});
export type CompassPlan = z.infer<typeof CompassPlan>;

export const QuillDraft = Envelope.extend({
  platform: z.enum(["x", "linkedin"]),
  text: z.string().min(1),
});
export type QuillDraft = z.infer<typeof QuillDraft>;

export const SentinelContentAudit = Envelope.extend({
  memoVerdict: z.enum(["confirmed", "needs_work", "refuted"]),
  drafts: z.array(
    z.object({
      index: z.number(),
      verdict: z.enum(["confirmed", "needs_work", "refuted"]),
      issues: z.array(z.string()),
    }),
  ),
  incidents: z.array(
    z.object({
      kind: z.enum(["unsourced_claim", "hallucination", "dod_unmet", "other"]),
      severity: z.enum(["low", "medium", "high"]),
      detail: z.string(),
    }),
  ),
});
export type SentinelContentAudit = z.infer<typeof SentinelContentAudit>;

export const HeraldDraft = Envelope.extend({
  subject: z.string().min(1).max(80),
  body: z.string().min(1),
  // Every personalization claim, mapped to the source that proves it —
  // Sentinel audits this table, not the prose.
  claims: z.array(z.object({ claim: z.string(), sourceUrl: z.string() })),
});
export type HeraldDraft = z.infer<typeof HeraldDraft>;

export const ForgeSpec = Envelope.extend({
  title: z.string().min(1),
  approach: z.string().min(1),
  acceptanceCriteria: z.array(z.string()).min(2).max(8),
  filesLikelyTouched: z.array(z.string()),
  risks: z.array(z.string()),
});
export type ForgeSpec = z.infer<typeof ForgeSpec>;

export const ProbeReview = Envelope.extend({
  verdict: z.enum(["confirmed", "needs_work", "refuted"]),
  criteria: z.array(
    z.object({ criterion: z.string(), met: z.boolean(), note: z.string() }),
  ),
  issues: z.array(z.string()),
});
export type ProbeReview = z.infer<typeof ProbeReview>;

export const RetroReport = Envelope.extend({
  healthSummary: z.string().min(1),
  wins: z.array(z.string()),
  concerns: z.array(z.string()),
  // Charter/process change proposals — ONLY the CEO merges these (final plan
  // locked decision #9). Every proposal must cite its evidence.
  proposals: z
    .array(
      z.object({
        target: z.string(), // e.g. "charter:radar" | "process" | "tier"
        change: z.string(),
        evidence: z.string(), // incident/lesson/scorecard citation
        expectedEffect: z.string(),
      }),
    )
    .max(5),
});
export type RetroReport = z.infer<typeof RetroReport>;

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---- Studio campaign contracts ---------------------------------------------
// The checkpoint pipeline: topics → (CEO picks) → briefs + hooks → (CEO picks)
// → drafts → polish → audit → (CEO approves) → calendar. Each stage's output
// is a typed envelope, so a malformed reply fails at the parser instead of
// halfway through the UI.

export const CONTENT_FORMATS = [
  "standard",
  "hot-topic",
  "brand-case-study",
] as const;

// Scout pass: raw topic candidates off the web + the platform snapshot.
export const TopicScan = Envelope.extend({
  topics: z
    .array(
      z.object({
        title: z.string().min(1),
        whyTrending: z.string(),
        angle: z.string(),
        pillar: z.string(),
        format: z.enum(CONTENT_FORMATS),
        sourceUrls: z.array(z.string()),
      }),
    )
    .max(16),
});
export type TopicScan = z.infer<typeof TopicScan>;

// Rank pass: the CEO's own ideas merged in verbatim, then ranked.
export const RankedTopics = Envelope.extend({
  ranked: z
    .array(
      z.object({
        rank: z.number(),
        title: z.string().min(1),
        source: z.string(), // Research | Your idea | Your idea + trending
        pillar: z.string(),
        format: z.enum(CONTENT_FORMATS),
        angle: z.string(),
        whyNow: z.string(),
      }),
    )
    .max(12),
});
export type RankedTopics = z.infer<typeof RankedTopics>;

// The schedule: which topic runs where, on what day, and how that platform
// should treat it. Compass produces this from the ranked shortlist; the CEO
// edits it before anything gets researched.
export const CampaignPlan = Envelope.extend({
  slots: z
    .array(
      z.object({
        date: z.string(),
        platform: z.enum(["linkedin", "x", "reddit"]),
        channel: z.string().optional(), // subreddit for reddit slots
        topicRank: z.number(), // points into the ranked shortlist
        treatment: z.string().min(1),
        wantsImage: z.boolean(),
      }),
    )
    .max(30),
  rationale: z.string(),
});
export type CampaignPlan = z.infer<typeof CampaignPlan>;

export const TopicBrief = Envelope.extend({
  keyStats: z.array(z.string()),
  examples: z.array(z.string()),
  angles: z.array(z.string()),
  hookCandidates: z.array(z.string()),
});
export type TopicBrief = z.infer<typeof TopicBrief>;

// One batched call covers every topic — five distinct hook types each.
export const HookBatch = Envelope.extend({
  sets: z.array(
    z.object({
      topicIndex: z.number(),
      hooks: z
        .array(z.object({ type: z.string(), text: z.string().min(1) }))
        .min(1)
        .max(6),
    }),
  ),
});
export type HookBatch = z.infer<typeof HookBatch>;

export const PostDraft = Envelope.extend({
  platform: z.enum(["x", "linkedin", "reddit"]),
  // Reddit is title-first; the other two ignore this.
  postTitle: z.string().optional(),
  text: z.string().min(1),
  hookType: z.string(),
  wordCount: z.number(),
});
export type PostDraft = z.infer<typeof PostDraft>;

// Style editor: one batched pass over every draft.
export const PolishBatch = Envelope.extend({
  polished: z.array(
    z.object({
      index: z.number(),
      text: z.string().min(1),
      postTitle: z.string().optional(),
      wordCount: z.number(),
      edits: z.array(z.string()),
    }),
  ),
});
export type PolishBatch = z.infer<typeof PolishBatch>;

// Image briefs. The team writes the prompt; the CEO generates the image
// elsewhere and attaches it. Nothing in this system calls an image model.
export const ImageBriefBatch = Envelope.extend({
  briefs: z.array(
    z.object({
      index: z.number(),
      prompt: z.string().min(1),
      altText: z.string().min(1),
      aspect: z.string(),
      rationale: z.string(),
    }),
  ),
});
export type ImageBriefBatch = z.infer<typeof ImageBriefBatch>;

// Pulse's strategy review. `kbUpdates` are PROPOSALS — the CEO applies them
// from the UI; no agent writes to the company's memory directly.
export const StrategyReport = Envelope.extend({
  pillarBalance: z.array(
    z.object({ pillar: z.string(), published: z.number(), note: z.string() }),
  ),
  whatWorked: z.array(z.string()),
  gaps: z.array(z.string()),
  audienceSignals: z.string(),
  recommendations: z
    .array(
      z.object({
        title: z.string(),
        what: z.string(),
        why: z.string(),
        how: z.string(),
      }),
    )
    .max(5),
  kbUpdates: z
    .array(
      z.object({
        target: z.enum(["voiceDos", "voiceDonts", "bannedTopics", "lessons", "pillars"]),
        change: z.string(),
        evidence: z.string(),
      }),
    )
    .max(8),
});
export type StrategyReport = z.infer<typeof StrategyReport>;
