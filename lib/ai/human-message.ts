// Shared voice rules + cleanup for candidate-facing AI prose (outreach, Reach
// DMs, cover letters, nudges). Keep prompts and post-processing in sync.

export const HUMAN_MESSAGE_VOICE = `VOICE (non-negotiable):
- Sound like a real person writing quickly to another person. Natural, fluid, specific.
- Never sound robotic, templated, or "AI-written". No buzzword stacks, no keyword stuffing, no resume-speak crammed into sentences.
- Never use em dashes (—) or en dashes (–). Use a comma, period, colon, or a plain hyphen with spaces ( - ) instead.
- Prefer short sentences and everyday words. One concrete detail beats three vague compliments.
- Avoid stock phrases: "I'm a big fan of what you're building", "I came across your profile", "I'd love to pick your brain", "leverage", "synergy", "passionate about", "excited to connect", "circle back", "touch base".`;

/** Strip AI-typical dashes from outbound prose after generation. */
export function sanitizeAiProse(text: string): string {
  return text
    .replace(/\u2014/g, " - ") // em dash
    .replace(/\u2013/g, " - ") // en dash
    .replace(/[ \t]+\-[ \t]+/g, " - ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
