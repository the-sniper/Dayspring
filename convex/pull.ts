import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { companyByNameForUser } from "./onboarding";

type NormalizedJob = {
  externalId: string;
  title: string;
  url: string;
  location: string | null;
  postedAt: string | null;
  descriptionText: string;
};

type WatchedCompany = {
  id: Id<"companies">;
  name: string;
  atsType: string;
  atsSlug: string;
};

const ATS_CONCURRENCY = 8;
const UPSERT_CHUNK = 15;

const US_HINT =
  /united states|\busa\b|\bu\.s\.|remote.*\bus\b|, (AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;
const NON_US_HINT =
  /\b(uk|united kingdom|canada|germany|france|india|australia|europe|apac|emea|latam|london|toronto|berlin|paris|singapore|dublin)\b/i;

function isUsLocation(location: string | null | undefined): boolean | null {
  if (!location?.trim()) return null;
  const loc = location.toLowerCase();
  if (NON_US_HINT.test(loc)) return false;
  if (US_HINT.test(loc)) return true;
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function dedupeKey(
  companyId: string,
  title: string,
  url?: string | null,
): Promise<string> {
  return sha256Hex(`${companyId}|${title.trim().toLowerCase()}|${url ?? ""}`);
}

function heuristicRoleType(title: string): string | null {
  const t = title.toLowerCase();
  if (/forward[- ]deployed|solutions? (engineer|architect)|field engineer/.test(t))
    return "FDE";
  if (/data (engineer|scientist|analyst)|machine learning|\bml\b/.test(t))
    return "DATA";
  if (/front[- ]?end|\bui engineer\b|react/.test(t)) return "FE";
  if (/back[- ]?end|platform engineer|infrastructure|devops|sre/.test(t))
    return "BE";
  if (/full[- ]?stack|product engineer/.test(t)) return "FS";
  return null;
}

async function fetchGreenhouse(slug: string): Promise<NormalizedJob[]> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    { headers: { accept: "application/json" }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`greenhouse/${slug}: HTTP ${res.status}`);
  const data = (await res.json()) as {
    jobs?: Array<{
      id: number;
      title: string;
      absolute_url: string;
      location?: { name?: string } | null;
      first_published?: string | null;
      updated_at?: string | null;
      content?: string | null;
    }>;
  };
  return (data.jobs ?? []).map((j) => ({
    externalId: String(j.id),
    title: j.title,
    url: j.absolute_url,
    location: j.location?.name ?? null,
    postedAt: j.first_published ?? j.updated_at ?? null,
    descriptionText: j.content ? stripHtml(j.content) : "",
  }));
}

async function fetchLever(slug: string): Promise<NormalizedJob[]> {
  const out: NormalizedJob[] = [];
  for (let page = 0; page < 30; page++) {
    const res = await fetch(
      `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json&limit=100&skip=${page * 100}`,
      { headers: { accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) throw new Error(`lever/${slug}: HTTP ${res.status}`);
    const batch = (await res.json()) as Array<{
      id: string;
      text: string;
      hostedUrl: string;
      createdAt?: number | string | null;
      categories?: { location?: string | null } | null;
      descriptionPlain?: string | null;
      description?: string | null;
    }>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const j of batch) {
      const created = Number(j.createdAt);
      out.push({
        externalId: j.id,
        title: j.text,
        url: j.hostedUrl,
        location: j.categories?.location ?? null,
        postedAt:
          Number.isFinite(created) && created > 0
            ? new Date(created).toISOString()
            : null,
        descriptionText:
          j.descriptionPlain ?? (j.description ? stripHtml(j.description) : ""),
      });
    }
    if (batch.length < 100) break;
  }
  return out;
}

async function fetchAshby(slug: string): Promise<NormalizedJob[]> {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
    { headers: { accept: "application/json" }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`ashby/${slug}: HTTP ${res.status}`);
  const data = (await res.json()) as {
    jobs?: Array<{
      id: string;
      title: string;
      jobUrl: string;
      location?: string | null;
      publishedAt?: string | null;
      isListed?: boolean;
      descriptionPlain?: string | null;
      descriptionHtml?: string | null;
    }>;
  };
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      externalId: j.id,
      title: j.title,
      url: j.jobUrl,
      location: j.location ?? null,
      postedAt: j.publishedAt ?? null,
      descriptionText:
        j.descriptionPlain ??
        (j.descriptionHtml ? stripHtml(j.descriptionHtml) : ""),
    }));
}

async function fetchBoard(c: WatchedCompany): Promise<NormalizedJob[]> {
  if (c.atsType === "greenhouse") return fetchGreenhouse(c.atsSlug);
  if (c.atsType === "lever") return fetchLever(c.atsSlug);
  if (c.atsType === "ashby") return fetchAshby(c.atsSlug);
  throw new Error(`unsupported ats: ${c.atsType}`);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export const watchedForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const rows = await ctx.db
      .query("companies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .filter((c) => c.atsType && c.atsSlug)
      .map((c) => ({
        id: c._id,
        name: c.name,
        atsType: c.atsType!,
        atsSlug: c.atsSlug!,
      }));
  },
});

export const upsertBatchForUser = internalMutation({
  args: {
    userId: v.id("users"),
    docs: v.array(v.any()),
  },
  handler: async (ctx, { userId, docs }) => {
    let added = 0;
    const insertedIds: string[] = [];
    for (const doc of docs) {
      const d = doc as {
        dedupeKey: string;
        source?: string;
        externalId?: string;
        description?: string;
      };
      const byKey = await ctx.db
        .query("jobs")
        .withIndex("by_user_dedupe", (q) =>
          q.eq("userId", userId).eq("dedupeKey", d.dedupeKey),
        )
        .unique();
      if (byKey) continue;
      if (d.externalId && d.source) {
        const byExt = await ctx.db
          .query("jobs")
          .withIndex("by_user_source_external", (q) =>
            q
              .eq("userId", userId)
              .eq("source", d.source!)
              .eq("externalId", d.externalId),
          )
          .unique();
        if (byExt) continue;
      }
      const text = typeof d.description === "string" ? d.description : "";
      const jobDoc: Record<string, unknown> = {
        ...(doc as Record<string, unknown>),
        userId,
      };
      delete jobDoc.description;
      jobDoc.jdChars = text.length;
      const id = await ctx.db.insert("jobs", jobDoc as never);
      if (text) {
        await ctx.db.insert("jobDescriptions", { jobId: id, text });
      }
      insertedIds.push(id);
      added++;
    }
    return { added, insertedIds };
  },
});

export const findOrCreateCompanyForUser = internalMutation({
  args: { userId: v.id("users"), name: v.string() },
  handler: async (ctx, { userId, name }) => {
    const existing = await companyByNameForUser(ctx, userId, name);
    if (existing) return existing._id;
    return await ctx.db.insert("companies", {
      userId,
      name: name.trim().replace(/\s+/g, " "),
      visaSponsor: false,
      createdAt: new Date().toISOString(),
    });
  },
});

export const touchLastPull = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const now = new Date().toISOString();
    const row = await ctx.db
      .query("settings")
      .withIndex("by_user_key", (q) =>
        q.eq("userId", userId).eq("key", "lastPullAt"),
      )
      .unique();
    if (row) await ctx.db.patch(row._id, { value: now, updatedAt: now });
    else
      await ctx.db.insert("settings", {
        userId,
        key: "lastPullAt",
        value: now,
        updatedAt: now,
      });
  },
});

// Background ATS pull for one user — used on signup and by the daily cron.
export const pullForUser = internalAction({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    { userId },
  ): Promise<{ added: number; companies: number; errors: number }> => {
    const watched: WatchedCompany[] = await ctx.runQuery(
      internal.pull.watchedForUser,
      { userId },
    );
    if (watched.length === 0) return { added: 0, companies: 0, errors: 0 };

    const settled = await mapPool(watched, ATS_CONCURRENCY, async (c: WatchedCompany) => ({
      company: c,
      fetched: await fetchBoard(c),
    }));

    const now = new Date().toISOString();
    let totalAdded = 0;
    let errors = 0;

    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === "rejected") {
        errors++;
        continue;
      }
      const { company, fetched } = s.value;
      const docs = [];
      for (const nj of fetched) {
        const isUs = isUsLocation(nj.location);
        if (isUs === false) continue;
        docs.push({
          companyId: company.id,
          title: nj.title,
          roleType: heuristicRoleType(nj.title),
          url: nj.url,
          source: company.atsType,
          externalId: nj.externalId,
          dedupeKey: await dedupeKey(company.id, nj.title, nj.url),
          status: "new",
          location: nj.location,
          isUs,
          description: nj.descriptionText,
          postedAt: nj.postedAt,
          createdAt: now,
          updatedAt: now,
        });
      }

      for (let j = 0; j < docs.length; j += UPSERT_CHUNK) {
        const chunk = docs.slice(j, j + UPSERT_CHUNK);
        const { added } = await ctx.runMutation(internal.pull.upsertBatchForUser, {
          userId,
          docs: chunk,
        });
        totalAdded += added;
        if (j + UPSERT_CHUNK < docs.length) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    }

    await ctx.runMutation(internal.pull.touchLastPull, { userId });
    return { added: totalAdded, companies: watched.length, errors };
  },
});
