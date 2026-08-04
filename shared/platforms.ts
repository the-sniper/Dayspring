// The three surfaces the GTM team writes for, and what each one actually
// demands. Isomorphic (no Next, no Convex imports) so the schema, the engine,
// the charters, and the UI all read the same spec — a length rule that lives
// in two places is a rule that will disagree with itself.

export const PLATFORM_IDS = ["linkedin", "x", "reddit"] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export type PlatformSpec = {
  id: PlatformId;
  label: string;
  short: string;
  /** Reddit posts are title-first; the title IS the hook. */
  needsTitle: boolean;
  /** Reddit needs a target community; the rules differ per subreddit. */
  channelLabel: string | null;
  maxChars: number | null;
  wordBand: [number, number] | null;
  hashtagMax: number;
  /** Whether an image usually earns its place here. */
  imageTypical: boolean;
  /** Fed verbatim into the writer's prompt. Keep each line actionable. */
  rules: string[];
};

export const PLATFORMS: Record<PlatformId, PlatformSpec> = {
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    short: "LI",
    needsTitle: false,
    channelLabel: null,
    maxChars: null,
    wordBand: [150, 250],
    hashtagMax: 3,
    imageTypical: true,
    rules: [
      "Hook on line 1, then a BLANK line (two line breaks) before the body — only the hook shows before '…see more'.",
      "150-250 words, hard ceiling 300.",
      "Paragraphs of 1-2 sentences. White space is deliberate.",
      "One takeaway that is an opinion someone could disagree with.",
      "One CTA at most, and it must sound like a person asking, not a growth tactic.",
      "0-3 hashtags at the very end, or none.",
    ],
  },
  x: {
    id: "x",
    label: "X / Twitter",
    short: "X",
    needsTitle: false,
    channelLabel: null,
    maxChars: 280,
    wordBand: null,
    hashtagMax: 1,
    imageTypical: true,
    rules: [
      "280 characters HARD. Count them; going over is a failed draft, not a long one.",
      "One idea. No thread, no '1/'.",
      "The hook IS the post — there is no body to redeem a weak opening.",
      "0-1 hashtags. No @-mention padding.",
      "A link costs you reach; include one only if the link is the point.",
    ],
  },
  reddit: {
    id: "reddit",
    label: "Reddit",
    short: "RD",
    needsTitle: true,
    channelLabel: "Subreddit",
    maxChars: null,
    wordBand: [200, 500],
    hashtagMax: 0,
    imageTypical: false,
    rules: [
      "The TITLE carries the post. Plain, specific, no clickbait punctuation, no emoji.",
      "200-500 words. Reddit rewards substance; a LinkedIn-length post reads as an ad.",
      "Write as a peer in the community, not as a brand. First person, no marketing cadence.",
      "NEVER hashtag. NEVER 'thoughts?' bait. NEVER open with 'Hey everyone!'.",
      "Self-promotion gets you banned: mention your own project only if it is genuinely the answer to the question, and say plainly that it's yours.",
      "Lead with the finding or the problem — the reader decides in one line whether this belongs in their feed.",
      "Answer the question the subreddit exists to answer. If the post would fit any subreddit, it fits none.",
    ],
  },
};

export function platformSpec(id: string): PlatformSpec {
  return PLATFORMS[id as PlatformId] ?? PLATFORMS.linkedin;
}

export function isPlatformId(x: string): x is PlatformId {
  return (PLATFORM_IDS as readonly string[]).includes(x);
}

/** The length contract as one line — used in prompts and in the DoD. */
export function lengthRule(id: string): string {
  const s = platformSpec(id);
  if (s.maxChars) return `≤${s.maxChars} characters`;
  if (s.wordBand) return `${s.wordBand[0]}-${s.wordBand[1]} words`;
  return "no fixed length";
}

/** Over-length check the UI and the engine share. */
export function overLimit(id: string, text: string): boolean {
  const s = platformSpec(id);
  if (s.maxChars) return text.length > s.maxChars;
  if (s.wordBand) {
    return text.trim().split(/\s+/).filter(Boolean).length > s.wordBand[1] * 1.2;
  }
  return false;
}

export function countLabel(id: string, text: string): string {
  const s = platformSpec(id);
  if (s.maxChars) return `${text.length}/${s.maxChars} characters`;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return s.wordBand ? `${words} words (aim ${s.wordBand[0]}-${s.wordBand[1]})` : `${words} words`;
}

/** Prompt block: everything the writer must obey for this surface. */
export function platformBrief(id: string): string {
  const s = platformSpec(id);
  return (
    `Platform: ${s.label}. Length: ${lengthRule(id)}. Hashtags: ${
      s.hashtagMax === 0 ? "NONE, ever" : `${s.hashtagMax} max`
    }.\n` +
    (s.needsTitle ? `This platform needs a TITLE as a separate field.\n` : "") +
    s.rules.map((r) => `- ${r}`).join("\n")
  );
}
