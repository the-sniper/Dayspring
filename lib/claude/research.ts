import { getClient, MODEL_PREMIUM, MODEL_SCORE } from "@/lib/claude/client";

// web_search is a server tool → incompatible with output_config structured
// output in the same call. So this is the "two-step": run messages.create with
// the tool, then walk the content blocks for prose + citations. We store the
// prose markdown verbatim (no second extraction pass) — it's human-read and
// appended to tailoring/outreach prompts as-is.

const RULES = `You are a research assistant producing a factual, current brief for a job candidate evaluating a company or role. Use web search.

Produce a tight markdown brief with these sections (omit a section only if you truly found nothing for it):
## Snapshot — one-line what the company does + stage/size if known
## Funding & business — rounds, investors, revenue model, notable customers
## Recent news — last 6–12 months: launches, leadership, layoffs, pivots (with dates)
## Tech & product — stack, key products, what engineering actually works on
## Interview intel — process notes, what they value, reported difficulty (only if found)

HARD RULES:
- Never fabricate. If the search results don't state something, write "not found" rather than infer funding rounds, headcount, tech, or interview details you didn't see.
- Cite specifics (dates, numbers, names) only when a source supports them.
- Be concise — this is a scannable brief, not an essay. No preamble, no "based on my research".`;

export type ResearchBrief = {
  brief: string;
  sources: { title: string; url: string }[];
  model: string;
};

type ContentBlock = {
  type: string;
  text?: string;
  citations?: { url?: string; title?: string }[] | null;
  content?: { type?: string; url?: string; title?: string }[] | null;
};

export async function generateBrief({
  subject,
  context,
  deep = false,
}: {
  subject: string;
  context: string;
  deep?: boolean;
}): Promise<ResearchBrief> {
  const model = deep ? MODEL_PREMIUM : MODEL_SCORE;
  const response = await getClient().messages.create({
    model,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    tools: [
      // Dynamic-filtering web search (Opus 4.8 / Sonnet 5). Not typed by every
      // SDK minor, so pass as a plain tool object.
      { type: "web_search_20260209", name: "web_search", max_uses: 5 },
    ] as never,
    system: RULES,
    messages: [
      {
        role: "user",
        content: `${subject}\n\nWhat the candidate is evaluating:\n${context}`,
      },
    ],
  });

  const blocks = response.content as unknown as ContentBlock[];
  const briefParts: string[] = [];
  const sourceMap = new Map<string, string>(); // url → title

  for (const b of blocks) {
    if (b.type === "text" && b.text) {
      briefParts.push(b.text);
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

  const brief = briefParts.join("").trim();
  if (!brief) {
    throw new Error(
      `Research produced no text (stop_reason: ${response.stop_reason}).`,
    );
  }
  return {
    brief,
    sources: [...sourceMap].map(([url, title]) => ({ url, title })),
    model,
  };
}
