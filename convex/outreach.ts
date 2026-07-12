import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { owned, requireUser } from "./lib";

export const getById = query({
  args: { id: v.id("outreach") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    return owned(await ctx.db.get(id), userId);
  },
});

export const insert = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => {
    const userId = await requireUser(ctx);
    return await ctx.db.insert("outreach", { ...doc, userId });
  },
});

export const patch = mutation({
  args: { id: v.id("outreach"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) throw new Error("Outreach not found");
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("outreach") },
  handler: async (ctx, { id }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(id), userId)) return;
    await ctx.db.delete(id);
  },
});

export const countForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const userId = await requireUser(ctx);
    if (!owned(await ctx.db.get(contactId), userId)) return 0;
    const rows = await ctx.db
      .query("outreach")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    return rows.length;
  },
});

// Outreach queue page: every outreach row joined with contact/job/company.
export const queue = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("outreach")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const out = [];
    for (const o of rows) {
      const contact = await ctx.db.get(o.contactId);
      const job = o.jobId ? await ctx.db.get(o.jobId) : null;
      const company = contact?.companyId ? await ctx.db.get(contact.companyId) : null;
      out.push({
        ...o,
        id: o._id,
        contact: contact ? { ...contact, id: contact._id } : null,
        job: job ? { ...job, id: job._id } : null,
        company: company ? { ...company, id: company._id } : null,
      });
    }
    return out;
  },
});

// Sent-but-unreplied rows (reply-detection sweep).
export const sentUnreplied = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("outreach")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .filter((o) => o.sentAt && !o.repliedAt && o.gmailThreadId)
      .map((o) => ({ ...o, id: o._id }));
  },
});
