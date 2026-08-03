import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { owned, requireUser } from "./lib";

// Which PDF apply-assist / the board will use for a job — mirrors
// lib/resumes/core.ts resumePdfForJob (pinned master → tailored → primary).
export type ResumeRef = {
  label: string;
  viewHref: string;
  kind: "tailored" | "master";
};

function masterHasPdf(m: {
  sourceFileId?: Id<"_storage">;
  sourceFile?: string;
}): boolean {
  return !!m.sourceFileId || !!m.sourceFile?.endsWith(".pdf");
}

type MasterRow = {
  _id: Id<"masterResumes">;
  userId?: Id<"users">;
  label: string;
  isPrimary: boolean;
  sourceFileId?: Id<"_storage">;
  sourceFile?: string;
};

export async function loadMastersForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<MasterRow[]> {
  return await ctx.db
    .query("masterResumes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

export async function resolveResumeRef(
  ctx: QueryCtx,
  userId: Id<"users">,
  jobId: Id<"jobs">,
  pinnedMasterId?: Id<"masterResumes"> | null,
  masters?: MasterRow[],
): Promise<ResumeRef | null> {
  if (pinnedMasterId) {
    const fromList = masters?.find((m) => m._id === pinnedMasterId);
    const m = fromList ?? owned(await ctx.db.get(pinnedMasterId), userId);
    if (m && masterHasPdf(m)) {
      return {
        label: m.label,
        viewHref: `/api/masters/${m._id}`,
        kind: "master",
      };
    }
  }

  const gens = await ctx.db
    .query("generatedResumes")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();
  gens.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const gen = gens[0];
  if (gen && owned(gen, userId) && (gen.pdfFileId || gen.pdfPath)) {
    return {
      label: "Tailored for this job",
      viewHref: `/api/resumes/${gen._id}`,
      kind: "tailored",
    };
  }

  const list = masters ?? (await loadMastersForUser(ctx, userId));
  const primary =
    list.find((m) => m.isPrimary && masterHasPdf(m)) ??
    list.find((m) => masterHasPdf(m));
  if (primary) {
    return {
      label: primary.isPrimary ? `${primary.label} (primary)` : primary.label,
      viewHref: `/api/masters/${primary._id}`,
      kind: "master",
    };
  }
  return null;
}

// ---- file storage (original master PDFs + rendered tailored PDFs) ------
// Hosted deployments have no writable disk, so PDF bytes live in Convex File
// Storage. Node uploads via generateUploadUrl; reads go through fileUrl.

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const fileUrl = query({
  args: { fileId: v.id("_storage") },
  handler: async (ctx, { fileId }) => {
    // Storage ids are unguessable; rows referencing them are user-scoped, so
    // requiring a signed-in caller is the meaningful gate here.
    await requireUser(ctx);
    return await ctx.storage.getUrl(fileId);
  },
});

// ---- master resumes ----------------------------------------------------

export const listMasters = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("masterResumes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows.map((r) => ({ ...r, id: r._id }));
  },
});

export const getMaster = query({
  args: { id: v.id("masterResumes") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    return owned(await ctx.db.get(id), userId);
  },
});

export const mastersCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("masterResumes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.length;
  },
});

export const insertMaster = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert("masterResumes", { ...doc, userId });
  },
});

export const patchMaster = mutation({
  args: { id: v.id("masterResumes"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) throw new Error("Master resume not found");
    await ctx.db.patch(id, patch);
  },
});

export const removeMaster = mutation({
  args: { id: v.id("masterResumes") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    const row = owned(await ctx.db.get(id), userId);
    if (!row) return;
    if (row.sourceFileId) await ctx.storage.delete(row.sourceFileId);
    await ctx.db.delete(id);
  },
});

// Exactly one primary master (within the user's masters).
export const setPrimaryMaster = mutation({
  args: { id: v.id("masterResumes") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) throw new Error("Master resume not found");
    const rows = await ctx.db
      .query("masterResumes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const r of rows) {
      if (r.isPrimary && r._id !== id) await ctx.db.patch(r._id, { isPrimary: false });
    }
    await ctx.db.patch(id, { isPrimary: true });
  },
});

// ---- generated (per-JD) resumes ---------------------------------------

export const getGenerated = query({
  args: { id: v.id("generatedResumes") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    return owned(await ctx.db.get(id), userId);
  },
});

export const latestForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(jobId), userId)) return null;
    const rows = await ctx.db
      .query("generatedResumes")
      .withIndex("by_job", (q) => q.eq("jobId", jobId))
      .collect();
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows[0] ? { ...rows[0], id: rows[0]._id } : null;
  },
});

export const insertGenerated = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert("generatedResumes", { ...doc, userId });
  },
});

export const patchGenerated = mutation({
  args: { id: v.id("generatedResumes"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUser(ctx);
    const row = owned(await ctx.db.get(id), userId);
    if (!row) throw new Error("Generated resume not found");
    // Re-rendered PDF replaces the old storage file — don't leak the bytes.
    if (patch.pdfFileId && row.pdfFileId && row.pdfFileId !== patch.pdfFileId) {
      await ctx.storage.delete(row.pdfFileId);
    }
    await ctx.db.patch(id, patch);
  },
});
