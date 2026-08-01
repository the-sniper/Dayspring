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

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
