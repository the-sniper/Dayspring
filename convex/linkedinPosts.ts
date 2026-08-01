import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isPastRetention, isWithinRetention } from "../shared/job-retention";
import { pickApplyLink } from "../shared/linkedin-posts";
import { owned, requireUser } from "./lib";

// LinkedIn hiring posts — the second feed source. Rows are small (post text is
// capped at ingestion), so the reads here collect the user's slice and filter
// in JS, exactly like the jobs feed.

async function userPostsByStatus(
  ctx: QueryCtx,
  userId: Id<"users">,
  status: string,
) {
  const rows = await ctx.db
    .query("linkedinPosts")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", status),
    )
    .collect();
  return rows.filter(isWithinRetention);
}

const asRow = (post: {
  _id: Id<"linkedinPosts">;
  externalId: string;
  postUrl: string;
  authorName: string;
  authorHeadline?: string;
  authorProfileUrl?: string;
  text: string;
  postedAt?: string;
  reactions?: number;
  companyName?: string;
  roleTitles?: string[];
  location?: string;
  jobUrl?: string;
  status: string;
  jobId?: Id<"jobs">;
  createdAt: string;
}) => ({
  id: post._id,
  postUrl: post.postUrl,
  authorName: post.authorName,
  authorHeadline: post.authorHeadline ?? null,
  authorProfileUrl: post.authorProfileUrl ?? null,
  text: post.text,
  postedAt: post.postedAt ?? null,
  reactions: post.reactions ?? null,
  companyName: post.companyName ?? null,
  roleTitles: post.roleTitles ?? [],
  location: post.location ?? null,
  // Persisted jobUrl wins; otherwise recover clear apply links (lnkd.in, ATS)
  // still present in the body — older rows often missed these when the model
  // returned link_index -1.
  jobUrl: post.jobUrl ?? pickApplyLink(post.text) ?? null,
  status: post.status,
  jobId: post.jobId ?? null,
  createdAt: post.createdAt,
});

// ---- reads -------------------------------------------------------------

// Posts tab: narrow by user+status via index, then free-text filter and
// paginate in JS (mirrors api.jobs.feed).
export const feed = query({
  args: {
    status: v.string(),
    q: v.string(),
    withLinkOnly: v.boolean(),
    // ISO cutoff — keep posts whose postedAt (else createdAt) is on or after.
    postedCutoff: v.union(v.string(), v.null()),
    // newest | oldest | reactions | company
    sort: v.string(),
    page: v.number(),
    pageSize: v.number(),
  },
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx);
    const base = await userPostsByStatus(ctx, userId, a.status);

    // Newest first by post time, falling back to when we ingested it.
    const when = (p: { postedAt?: string; createdAt: string }) =>
      p.postedAt ?? p.createdAt;

    const ql = (a.q ?? "").trim().toLowerCase();
    const filtered = base.filter((p) => {
      if (a.withLinkOnly && !(p.jobUrl ?? pickApplyLink(p.text))) return false;
      if (a.postedCutoff !== null && when(p) < a.postedCutoff) return false;
      if (!ql) return true;
      const titles = Array.isArray(p.roleTitles) ? p.roleTitles : [];
      return (
        (p.text ?? "").toLowerCase().includes(ql) ||
        (p.authorName ?? "").toLowerCase().includes(ql) ||
        (p.companyName ?? "").toLowerCase().includes(ql) ||
        titles.some(
          (t) => typeof t === "string" && t.toLowerCase().includes(ql),
        )
      );
    });

    filtered.sort((x, y) => {
      if (a.sort === "oldest") return when(x).localeCompare(when(y));
      if (a.sort === "reactions") {
        const rx = x.reactions ?? 0;
        const ry = y.reactions ?? 0;
        if (ry !== rx) return ry - rx;
        return when(y).localeCompare(when(x));
      }
      if (a.sort === "company") {
        const cx = (x.companyName ?? x.authorName ?? "").toLowerCase();
        const cy = (y.companyName ?? y.authorName ?? "").toLowerCase();
        if (cx !== cy) return cx.localeCompare(cy);
        return when(y).localeCompare(when(x));
      }
      // newest (default)
      return when(y).localeCompare(when(x));
    });

    const total = filtered.length;
    const pageSize = Math.max(1, a.pageSize);
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    // Deep links / stale ?page=N after a page-size change overshoot the end —
    // clamp so the caller always gets a real page of rows.
    const page = Math.min(Math.max(1, Math.floor(a.page) || 1), totalPages);
    const start = (page - 1) * pageSize;
    return {
      rows: filtered.slice(start, start + pageSize).map(asRow),
      total,
      page,
    };
  },
});

// Provider post ids already stored for this user, so a pull can skip both the
// insert AND the extraction cost for anything seen before. Bounded by the
// caller's candidate list rather than scanning the whole table.
export const existingIds = query({
  args: { externalIds: v.array(v.string()) },
  handler: async (ctx, { externalIds }) => {
    const userId = await requireUser(ctx);
    const found: string[] = [];
    for (const externalId of externalIds) {
      const hit = await ctx.db
        .query("linkedinPosts")
        .withIndex("by_user_external", (q) =>
          q.eq("userId", userId).eq("externalId", externalId),
        )
        .first();
      if (hit) found.push(externalId);
    }
    return found;
  },
});

// Per-status row counts — the tab badge and the pull summary.
export const counts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const posts = await ctx.db
      .query("linkedinPosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const out: Record<string, number> = {};
    for (const p of posts) {
      if (!isWithinRetention(p)) continue;
      out[p.status] = (out[p.status] ?? 0) + 1;
    }
    return out;
  },
});

export const getById = query({
  args: { id: v.id("linkedinPosts") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const post = owned(await ctx.db.get(id), userId);
    if (!post || isPastRetention(post)) return null;
    return asRow(post);
  },
});

// ---- writes ------------------------------------------------------------

// Dedupe-aware bulk insert, keyed on the provider's post id.
export const upsertBatch = mutation({
  args: { docs: v.array(v.any()) },
  handler: async (ctx, { docs }) => {
    const userId = await requireUser(ctx);
    const insertedIds: string[] = [];
    for (const doc of docs) {
      const d = doc as {
        externalId: string;
        postedAt?: string | null;
        createdAt?: string;
      };
      if (
        isPastRetention({
          postedAt: d.postedAt,
          createdAt: d.createdAt ?? new Date().toISOString(),
        })
      ) {
        continue;
      }
      const existing = await ctx.db
        .query("linkedinPosts")
        .withIndex("by_user_external", (q) =>
          q.eq("userId", userId).eq("externalId", d.externalId),
        )
        .first();
      if (existing) continue;
      const id = await ctx.db.insert("linkedinPosts", {
        ...(doc as Record<string, unknown>),
        userId,
      } as never);
      insertedIds.push(id);
    }
    return { added: insertedIds.length, insertedIds };
  },
});

export const patch = mutation({
  args: { id: v.id("linkedinPosts"), patch: v.any() },
  handler: async (ctx, { id, patch: fields }) => {
    const userId = await requireUser(ctx);
    const post = owned(await ctx.db.get(id), userId);
    if (!post) throw new Error("Post not found");
    await ctx.db.patch(id, {
      ...fields,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const setStatus = mutation({
  args: { id: v.id("linkedinPosts"), to: v.string() },
  handler: async (ctx, { id, to }) => {
    const userId = await requireUser(ctx);
    const post = owned(await ctx.db.get(id), userId);
    if (!post) return { ok: false as const, error: "Post not found" };
    await ctx.db.patch(id, { status: to, updatedAt: new Date().toISOString() });
    return { ok: true as const };
  },
});

// Bulk status change for "Mark all done" on the current page.
export const setStatusBatch = mutation({
  args: { ids: v.array(v.id("linkedinPosts")), to: v.string() },
  handler: async (ctx, { ids, to }) => {
    const userId = await requireUser(ctx);
    const now = new Date().toISOString();
    let updated = 0;
    for (const id of ids) {
      const post = owned(await ctx.db.get(id), userId);
      if (!post || post.status === to) continue;
      await ctx.db.patch(id, { status: to, updatedAt: now });
      updated++;
    }
    return { updated };
  },
});

// Called after a post is promoted into the pipeline: links the two rows and
// moves the post out of the triage list in one write.
export const markPromoted = mutation({
  args: { id: v.id("linkedinPosts"), jobId: v.id("jobs") },
  handler: async (ctx, { id, jobId }) => {
    const userId = await requireUser(ctx);
    const post = owned(await ctx.db.get(id), userId);
    if (!post) return { ok: false as const, error: "Post not found" };
    const job = owned(await ctx.db.get(jobId), userId);
    if (!job) return { ok: false as const, error: "Job not found" };
    await ctx.db.patch(id, {
      jobId,
      status: "saved",
      updatedAt: new Date().toISOString(),
    });
    return { ok: true as const };
  },
});
