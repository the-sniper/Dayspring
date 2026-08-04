// One metered, budget-guarded, envelope-validated model call — the single
// entry point every agent in the company goes through.
//
// Extracted from run.ts so the daily run and the Studio campaign engine share
// exactly one implementation of the things that must never drift: the budget
// guard, the ledger row, citation collection from web_search, and the
// envelope-repair retry. An un-ledgered call is a bug; there is no second path
// that could produce one.
import { getClient } from "@/lib/claude/client";
import { api, convex } from "@/lib/convex/server";
import type { buildSystem } from "@/lib/orchestra/charters";
import { guardBudget, recordSpend, type Usage } from "@/lib/orchestra/ledger";
import { type Citation, extractEnvelope } from "@/lib/orchestra/types";
import type { z } from "zod";

type ContentBlock = {
  type: string;
  text?: string;
  citations?: { url?: string; title?: string }[] | null;
  content?: { type?: string; url?: string; title?: string }[] | null;
};

export type CallArgs = {
  runDate: string;
  role: string;
  taskId?: string;
  model: string;
  system: ReturnType<typeof buildSystem>;
  user: string;
  maxTokens: number;
  webSearchUses?: number;
};

export type CallResult = {
  text: string;
  citations: Citation[];
  usage: Usage;
  costUsd: number;
  // "max_tokens" here means the reply was cut off — see callWithEnvelope.
  stopReason: string | null;
};

// Adaptive thinking is a per-model capability, not a universal one: Haiku 4.5
// rejects the field with a 400 rather than ignoring it. Kept as an explicit
// list because "guess from the model name" is how the next model breaks this.
const NO_ADAPTIVE_THINKING = new Set(["claude-haiku-4-5"]);

// web_search is a server tool (two-step pattern, same as lib/claude/research.ts):
// prose + citations are walked out of the content blocks.
export async function meteredCall(args: CallArgs): Promise<CallResult> {
  await guardBudget(args.runDate);
  const client = await getClient();
  const response = await client.messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    ...(NO_ADAPTIVE_THINKING.has(args.model)
      ? {}
      : { thinking: { type: "adaptive" as const } }),
    system: args.system as never,
    ...(args.webSearchUses
      ? {
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: args.webSearchUses,
            },
          ] as never,
        }
      : {}),
    messages: [{ role: "user", content: args.user }],
  });
  const usage = response.usage as unknown as Usage;
  // Why the model stopped. Without this, a reply cut off at max_tokens and a
  // reply that simply ignored the format are indistinguishable — both surface
  // as "No JSON envelope found".
  const stopReason =
    (response as unknown as { stop_reason?: string }).stop_reason ?? null;
  const costUsd = await recordSpend({
    runDate: args.runDate,
    role: args.role,
    taskId: args.taskId,
    model: args.model,
    usage,
  });

  const blocks = response.content as unknown as ContentBlock[];
  const parts: string[] = [];
  const sourceMap = new Map<string, string>();
  for (const b of blocks) {
    if (b.type === "text" && b.text) {
      parts.push(b.text);
      for (const c of b.citations ?? []) {
        if (c.url) sourceMap.set(c.url, c.title || c.url);
      }
    } else if (b.type === "web_search_tool_result") {
      for (const r of b.content ?? []) {
        if (r.type === "web_search_result" && r.url) {
          sourceMap.set(r.url, r.title || r.url);
        }
      }
    }
  }
  return {
    text: parts.join("").trim(),
    citations: [...sourceMap].map(([url, title]) => ({ url, title })),
    usage,
    costUsd,
    stopReason,
  };
}

export type EnvelopeCall<T> = {
  data: T;
  body: string;
  citations: Citation[];
  usage: Usage;
  costUsd: number;
};

// Envelope-or-retry: one repair attempt with the parse error injected. A
// second failure is an incident (kind: parse_failure) and throws.
export async function callWithEnvelope<T>(
  callArgs: CallArgs,
  schema: z.ZodType<T>,
): Promise<EnvelopeCall<T>> {
  const first = await meteredCall(callArgs);
  let parsed = extractEnvelope<T>(first.text, schema);
  if (parsed.ok) {
    return {
      data: parsed.data,
      body: parsed.body,
      citations: first.citations,
      usage: first.usage,
      costUsd: first.costUsd,
    };
  }
  // The envelope goes LAST, so a reply cut off at max_tokens loses exactly the
  // envelope and nothing else. Asking such a reply to "re-emit the full
  // deliverable" makes it longer and it truncates again — so ask only for the
  // envelope instead, and give it room.
  //
  // A schema mismatch (a missing required array, usually) gets the same
  // treatment for the same reason: the prose was fine, only the envelope was
  // wrong, and re-running the whole deliverable is both expensive and a second
  // chance to truncate.
  const truncated = first.stopReason === "max_tokens";
  const repairUser = truncated
    ? `${callArgs.user}\n\n[SYSTEM REPAIR] Your previous reply was cut off before its \`\`\`json envelope.\n` +
      `Do NOT rewrite the deliverable. Reply with ONLY the \`\`\`json envelope summarising the work below.\n` +
      `Your previous reply (for reference):\n${first.text.slice(0, 6000)}`
    : `${callArgs.user}\n\n[SYSTEM REPAIR] Your previous reply's envelope failed validation:\n${parsed.error}\n` +
      `Do NOT rewrite the deliverable. Reply with ONLY a corrected \`\`\`json envelope — every field the schema in your instructions lists, filled in from the work below.\n` +
      `Your previous reply (for reference):\n${first.text.slice(0, 8000)}`;
  const retry = await meteredCall({
    ...callArgs,
    user: repairUser,
    // Envelope-only replies are short, but the cap has to clear adaptive
    // thinking before any text is emitted at all.
    maxTokens: Math.max(callArgs.maxTokens, 6000),
    // The repair needs no fresh searching — it is re-formatting work that is
    // already done, and paying for tool calls twice is how a retry gets
    // expensive.
    ...(callArgs.webSearchUses ? { webSearchUses: undefined } : {}),
  });
  parsed = extractEnvelope<T>(retry.text, schema);
  if (!parsed.ok) {
    // Name the stop reason: "ran out of tokens" and "ignored the format" need
    // different fixes.
    const why =
      retry.stopReason === "max_tokens"
        ? ` (both replies hit the ${callArgs.maxTokens}-token cap before the envelope — raise this role's maxTokens)`
        : retry.stopReason && retry.stopReason !== "end_turn"
          ? ` (stop_reason: ${retry.stopReason})`
          : "";
    await convex().mutation(api.orchestra.insertIncident, {
      runDate: callArgs.runDate,
      role: callArgs.role,
      ...(callArgs.taskId ? { taskId: callArgs.taskId as never } : {}),
      kind: "parse_failure",
      severity: "medium",
      detail: `Envelope invalid after retry: ${parsed.error}${why}`,
    });
    throw new Error(
      `${callArgs.role}: envelope invalid after retry — ${parsed.error}${why}`,
    );
  }
  // Both repair paths ask for the envelope alone, so the retry usually has no
  // prose. The deliverable is the FIRST reply's body — falling through to the
  // retry's empty body would throw away the work that was actually done.
  const firstBody = first.text.replace(/```(?:json)?\s*[\s\S]*?```\s*$/, "").trim();
  return {
    data: parsed.data,
    body: parsed.body || firstBody,
    citations: [...retry.citations, ...first.citations],
    usage: retry.usage,
    costUsd: first.costUsd + retry.costUsd,
  };
}
