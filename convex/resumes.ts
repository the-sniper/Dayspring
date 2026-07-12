import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---- file storage (original master PDFs + rendered tailored PDFs) ------
// Hosted deployments have no writable disk, so PDF bytes live in Convex File
// Storage. Node uploads via generateUploadUrl; reads go through fileUrl.

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const fileUrl = query({
  args: { fileId: v.id("_storage") },
  handler: async (ctx, { fileId }) => await ctx.storage.getUrl(fileId),
});

// ---- master resumes ----------------------------------------------------

export const listMasters = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("masterResumes").collect();
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows.map((r) => ({ ...r, id: r._id }));
  },
});

export const getMaster = query({
  args: { id: v.id("masterResumes") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const mastersCount = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("masterResumes").collect()).length,
});

export const insertMaster = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => await ctx.db.insert("masterResumes", doc),
});

export const patchMaster = mutation({
  args: { id: v.id("masterResumes"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const removeMaster = mutation({
  args: { id: v.id("masterResumes") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.sourceFileId) await ctx.storage.delete(row.sourceFileId);
    await ctx.db.delete(id);
  },
});

// Exactly one primary master.
export const setPrimaryMaster = mutation({
  args: { id: v.id("masterResumes") },
  handler: async (ctx, { id }) => {
    const rows = await ctx.db.query("masterResumes").collect();
    for (const r of rows) {
      if (r.isPrimary && r._id !== id) await ctx.db.patch(r._id, { isPrimary: false });
    }
    await ctx.db.patch(id, { isPrimary: true });
  },
});

// ---- generated (per-JD) resumes ---------------------------------------

export const getGenerated = query({
  args: { id: v.id("generatedResumes") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const latestForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
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
  handler: async (ctx, { doc }) => await ctx.db.insert("generatedResumes", doc),
});

export const patchGenerated = mutation({
  args: { id: v.id("generatedResumes"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    // Re-rendered PDF replaces the old storage file — don't leak the bytes.
    if (patch.pdfFileId) {
      const row = await ctx.db.get(id);
      if (row?.pdfFileId && row.pdfFileId !== patch.pdfFileId) {
        await ctx.storage.delete(row.pdfFileId);
      }
    }
    await ctx.db.patch(id, patch);
  },
});
