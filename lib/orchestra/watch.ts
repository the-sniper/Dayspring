// VIGIL — the platform watcher (Ops & Quality, pure code). Every run it
// fingerprints each domain of platform state, diffs against the last run,
// persists the new fingerprints, and hands the change list to Atlas — so
// when the CEO edits their profile, swaps a resume, tunes the brand voice,
// changes the tier, or grows the watchlist, the company explicitly KNOWS
// and plans around it (and the daily report says so).
//
// Note the division of labor: agents already read all of this live each run
// (nothing is cached stale) — Vigil adds *awareness of change*, which is what
// lets Atlas react instead of merely absorb.
import { createHash } from "node:crypto";
import { api, convex } from "@/lib/convex/server";
import {
  getBannedData,
  getLessonsData,
  getVoiceData,
  renderVoice,
} from "@/lib/orchestra/memory";
import { resolveTier } from "@/lib/orchestra/tiers";
import { getSetting, setSetting } from "@/lib/settings/store";

const STORE_KEY = "orchVigilFingerprints";

type Domain = { hash: string; label: string };
type Store = Record<string, Domain>;

function fp(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

export type VigilResult = {
  firstRun: boolean;
  changes: string[]; // human-readable, e.g. "profile: headline updated"
};

export async function vigilScan(): Promise<VigilResult> {
  const [state, voice, banned, lessons, tier] = await Promise.all([
    convex().query(api.orchestra.platformState, {}),
    getVoiceData(),
    getBannedData(),
    getLessonsData(),
    resolveTier(),
  ]);

  const current: Store = {
    profile: {
      hash: fp([state.profileUpdatedAt, state.profileHeadline, state.profileName]),
      label: state.profileHeadline
        ? `"${state.profileHeadline}" (updated ${state.profileUpdatedAt?.slice(0, 10) ?? "?"})`
        : "no profile yet",
    },
    resumes: {
      hash: fp([state.resumeCount, state.resumeUpdatedAt, state.primaryResumeLabel]),
      label: `${state.resumeCount} resume(s), primary "${state.primaryResumeLabel ?? "-"}"`,
    },
    companies: {
      hash: fp(state.companiesCount),
      label: `${state.companiesCount} watched companies`,
    },
    contacts: {
      hash: fp(state.contactsCount),
      label: `${state.contactsCount} contacts`,
    },
    brandVoice: {
      hash: fp(renderVoice(voice)),
      label: `${voice.tones.length} tones, ${voice.samplePosts.length} samples, ${voice.projects.filter((p) => p.verifiedAt).length} verified projects`,
    },
    bannedTopics: {
      hash: fp(banned.topics),
      label: `${banned.topics.length} banned topics`,
    },
    lessons: {
      hash: fp(lessons.lessons),
      label: `${lessons.lessons.length} lessons`,
    },
    tier: { hash: fp(tier.id), label: `tier "${tier.id}"` },
  };

  const raw = await getSetting(STORE_KEY);
  const prev: Store | null = raw ? (JSON.parse(raw) as Store) : null;

  const changes: string[] = [];
  if (prev) {
    for (const [domain, cur] of Object.entries(current)) {
      const old = prev[domain];
      if (!old) changes.push(`${domain}: now tracked (${cur.label})`);
      else if (old.hash !== cur.hash)
        changes.push(`${domain}: ${old.label} → ${cur.label}`);
    }
  }
  await setSetting(STORE_KEY, JSON.stringify(current));
  return { firstRun: !prev, changes };
}
