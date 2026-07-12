import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getById = query({
  args: { id: v.id("outreach") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const insert = mutation({
  args: { doc: v.any() },
  handler: async (ctx, { doc }) => await ctx.db.insert("outreach", doc),
});

export const patch = mutation({
  args: { id: v.id("outreach"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("outreach") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const countForContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
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
    const rows = await ctx.db.query("outreach").collect();
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
    const rows = await ctx.db.query("outreach").collect();
    return rows
      .filter((o) => o.sentAt && !o.repliedAt && o.gmailThreadId)
      .map((o) => ({ ...o, id: o._id }));
  },
});
