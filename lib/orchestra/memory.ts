// The company's editable memory (final plan Phase 2), stored as STRUCTURED
// JSON in the settings table and rendered to prompt text at read time — the
// /company/team editor works with fields and chips, agents keep getting the
// same markdown block. Legacy free-text values migrate transparently.
//
// Rendered text is appended to USER messages, never the system prefix — so
// editing memory never busts the charter cache.
import { getSetting, setSetting } from "@/lib/settings/store";

export const MEMORY_KEYS = {
  brandVoice: "orchBrandVoice",
  bannedTopics: "orchBannedTopics",
  lessons: "orchLessons",
} as const;

export type MemoryKey = keyof typeof MEMORY_KEYS;

// A project must EARN citability: it needs a URL, and the server verifies the
// URL resolves at save time (verifyProjects). Unverified projects render to
// agents as name-only with an explicit no-claims instruction — a typed-in fake
// can never become a confident post.
export type ProjectRef = { name: string; url: string; verifiedAt?: string };

// A post worth learning from. `performance` is what it actually did; `why` is
// the CEO's own read on why it worked. Both optional — a sample with neither
// is still voice fuel.
export type WritingSample = {
  text: string;
  performance?: string;
  why?: string;
  addedAt?: string;
};

export type BrandVoiceData = {
  tones: string[]; // e.g. "Direct", "Technical", "First-person"
  audience: string; // who the posts are for
  goal: string; // the honest reason for posting at all
  pillars: string[]; // content pillars — the campaign's topic universe
  stories: string[]; // story bank, verbatim: the real moments posts anchor to
  projects: ProjectRef[]; // Quill may cite VERIFIED ones (with their URL)
  dos: string[];
  donts: string[];
  samplePosts: string[]; // legacy field — migrated into `samples` on read
  samples: WritingSample[]; // posts that sound like the CEO — Quill's fuel
  freeform: string; // anything that doesn't fit the fields
};

export type BannedTopicsData = { topics: string[] };

export type Lesson = { date: string; text: string };
export type LessonsData = { lessons: Lesson[] };

export const VOICE_DEFAULT: BrandVoiceData = {
  tones: ["Direct", "Technical", "First-person", "Build-in-public"],
  audience: "",
  goal: "",
  // The campaign's topic universe. Radar may not invent a pillar, so an empty
  // list means the scout falls back to the free-text focus instead.
  pillars: ["AI & Automation", "Building & Shipping", "Career & Job Search"],
  stories: [],
  // Names seeded from what the CEO stated; they stay unverified (name-only for
  // agents) until a URL is added and checked.
  projects: [
    { name: "Klyro", url: "" },
    { name: "AirLog", url: "https://airlog.live" },
    { name: "Hound", url: "" },
    { name: "Dayspring", url: "" },
  ],
  dos: [
    "Short sentences; specific numbers over adjectives",
    "Show the work: what was built, what broke, what was learned",
    "Takes must come from something actually built or measured",
  ],
  donts: [
    'Hype words ("game-changer", "revolutionary", 🚀-speak)',
    'Announce-speak ("thrilled to announce")',
    'Engagement bait ("Agree?" endings)',
  ],
  samplePosts: [],
  samples: [],
  freeform: "",
};

export const BANNED_DEFAULT: BannedTopicsData = {
  topics: [
    "Politics, religion, culture-war anything",
    "Current/past employers in a negative light; anything under NDA",
    "Salary numbers or interview processes of specific named companies",
    "Claims about people that aren't from a cited public source",
    "Advice in regulated domains (legal, medical, financial)",
  ],
};

const MAX_LESSONS = 40;

function parseOr<T>(raw: string | null, fallback: T, legacy: (text: string) => T): T {
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw) as T;
    if (p && typeof p === "object") return p;
    return fallback;
  } catch {
    // Legacy plain-text value from the textarea era — migrate.
    return legacy(raw);
  }
}

export async function getVoiceData(): Promise<BrandVoiceData> {
  const raw = await getSetting(MEMORY_KEYS.brandVoice);
  const data = parseOr<BrandVoiceData>(raw, VOICE_DEFAULT, (text) => ({
    ...VOICE_DEFAULT,
    freeform: text,
  }));
  // Migrate the earlier structured format where projects were plain strings.
  data.projects = (data.projects ?? []).map((pr) =>
    typeof pr === "string" ? { name: pr, url: "" } : pr,
  );
  // Fields added after the first shipped version — a stored value from before
  // them is still valid, it just doesn't have them yet.
  data.tones ??= [];
  data.audience ??= "";
  data.goal ??= "";
  data.pillars ??= VOICE_DEFAULT.pillars;
  data.stories ??= [];
  data.dos ??= [];
  data.donts ??= [];
  data.samples ??= [];
  // samplePosts was a flat string list; fold it into the richer shape once so
  // there is exactly one place samples live from here on.
  if (data.samplePosts?.length) {
    data.samples = [
      ...data.samples,
      ...data.samplePosts.map((text) => ({ text })),
    ];
    data.samplePosts = [];
  }
  return data;
}

// Server-side evidence check, run at save time: a project with a URL that
// responds becomes verified (dated); anything else stays name-only. Network
// hiccups just leave it unverified — never an error.
export async function verifyProjects(
  projects: ProjectRef[],
): Promise<ProjectRef[]> {
  return await Promise.all(
    projects.map(async (pr) => {
      const url = pr.url.trim();
      if (!url) return { name: pr.name, url: "" };
      if (!/^https?:\/\//.test(url)) return { name: pr.name, url };
      try {
        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(6000),
        });
        return res.ok || res.status === 403 // bot-blocked sites still exist
          ? { name: pr.name, url, verifiedAt: new Date().toISOString().slice(0, 10) }
          : { name: pr.name, url };
      } catch {
        return { name: pr.name, url };
      }
    }),
  );
}

export async function getBannedData(): Promise<BannedTopicsData> {
  const raw = await getSetting(MEMORY_KEYS.bannedTopics);
  return parseOr<BannedTopicsData>(raw, BANNED_DEFAULT, (text) => ({
    topics: text
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean),
  }));
}

export async function getLessonsData(): Promise<LessonsData> {
  const raw = await getSetting(MEMORY_KEYS.lessons);
  return parseOr<LessonsData>(raw, { lessons: [] }, (text) => ({
    lessons: text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => {
        const m = l.match(/^- \[(\d{4}-\d{2}-\d{2})\]\s*(.*)$/);
        return m ? { date: m[1], text: m[2] } : { date: "", text: l.slice(2) };
      }),
  }));
}

export async function saveMemoryData(
  key: MemoryKey,
  value: BrandVoiceData | BannedTopicsData | LessonsData,
): Promise<void> {
  await setSetting(MEMORY_KEYS[key], JSON.stringify(value));
}

export async function appendLesson(lesson: string): Promise<void> {
  const data = await getLessonsData();
  data.lessons.push({
    date: new Date().toISOString().slice(0, 10),
    text: lesson,
  });
  data.lessons = data.lessons.slice(-MAX_LESSONS);
  await saveMemoryData("lessons", data);
}

// ---- Prompt rendering (what agents actually read) ---------------------------

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)";
}

export function renderVoice(v: BrandVoiceData): string {
  const verified = v.projects.filter((p) => p.verifiedAt && p.url);
  const unverified = v.projects.filter((p) => !p.verifiedAt || !p.url);
  const projectLine =
    (verified.length
      ? `Projects that may be cited (with their URL as the source): ${verified
          .map((p) => `${p.name} (${p.url})`)
          .join(", ")}. `
      : "No verified projects — cite no project specifics. ") +
    (unverified.length
      ? `Known but UNVERIFIED (name-drop only, zero claims about them): ${unverified
          .map((p) => p.name)
          .join(", ")}.`
      : "");
  return (
    `Tone: ${v.tones.join(", ") || "unspecified"}. ${projectLine}\n` +
    (v.audience ? `Audience: ${v.audience}\n` : "") +
    (v.goal ? `Why he posts: ${v.goal}\n` : "") +
    `Do:\n${bullets(v.dos)}\nDon't:\n${bullets(v.donts)}` +
    (v.samples.length
      ? `\nPosts that sound like the CEO (match this voice — study the rhythm, never copy the content):\n${v.samples
          .map(
            (s, i) =>
              `--- sample ${i + 1}${s.performance ? ` (${s.performance})` : ""}${
                s.why ? ` — why it worked: ${s.why}` : ""
              } ---\n${s.text}`,
          )
          .join("\n")}`
      : "") +
    (v.freeform ? `\nNotes:\n${v.freeform}` : "")
  );
}

// The story bank is what keeps posts in Mode A (a real moment) instead of
// Mode B (a faceless article). Rendered verbatim — these are the CEO's words.
export function renderStories(v: BrandVoiceData): string {
  return v.stories.length
    ? bullets(v.stories)
    : "- (empty — no real moments on file, so posts must use explicit POV framing instead of invented anecdotes)";
}

export function renderPillars(v: BrandVoiceData): string {
  return v.pillars.length ? v.pillars.join(" · ") : "(none set)";
}

// Called when the CEO marks a published post as one worth learning from.
export async function appendSample(sample: WritingSample): Promise<void> {
  const v = await getVoiceData();
  v.samples = [
    ...v.samples,
    { ...sample, addedAt: new Date().toISOString().slice(0, 10) },
  ].slice(-12); // a dozen is plenty of calibration; more just costs tokens
  await saveMemoryData("brandVoice", v);
}

export function renderBanned(b: BannedTopicsData): string {
  return bullets(b.topics);
}

export function renderLessons(l: LessonsData): string {
  return l.lessons.length
    ? l.lessons.map((x) => `- ${x.date ? `[${x.date}] ` : ""}${x.text}`).join("\n")
    : "(no lessons yet)";
}

// Back-compat text getter (retro reads lessons as text).
export async function getMemory(
  key: MemoryKey,
): Promise<string> {
  if (key === "brandVoice") return renderVoice(await getVoiceData());
  if (key === "bannedTopics") return renderBanned(await getBannedData());
  return renderLessons(await getLessonsData());
}

export async function memoryBlock(): Promise<string> {
  const [voice, banned, lessons] = await Promise.all([
    getVoiceData(),
    getBannedData(),
    getLessonsData(),
  ]);
  return `### Brand voice\n${renderVoice(voice)}\n\n### Banned topics (hard rule)\n${renderBanned(banned)}\n\n### Lessons from past rejections\n${renderLessons(lessons)}`;
}

// The campaign's fuller context block: everything memoryBlock has, plus the
// pillars and the story bank the content pipeline anchors posts to.
export async function campaignMemoryBlock(): Promise<string> {
  const [voice, banned, lessons] = await Promise.all([
    getVoiceData(),
    getBannedData(),
    getLessonsData(),
  ]);
  return (
    `### Content pillars\n${renderPillars(voice)}\n\n` +
    `### Brand voice\n${renderVoice(voice)}\n\n` +
    `### Story bank (real moments — anchor posts to these, never invent one)\n${renderStories(voice)}\n\n` +
    `### Banned topics (hard rule)\n${renderBanned(banned)}\n\n` +
    `### Lessons from past rejections\n${renderLessons(lessons)}`
  );
}
