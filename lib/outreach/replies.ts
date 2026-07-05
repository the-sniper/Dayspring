import { and, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { outreach } from "@/lib/db/schema";
import {
  getGmailConfig,
  getThread,
  hasGmail,
} from "@/lib/integrations/gmail/client";
import { markReplied } from "@/lib/outreach/core";

// Thread-based reply detection: any message in the thread newer than our
// send, from someone who isn't us, counts as a reply. Runs from the daily
// script and the "Check replies" button.
export async function checkReplies(): Promise<{ checked: number; found: number }> {
  if (!hasGmail()) return { checked: 0, found: 0 };
  const me = (getGmailConfig()?.email ?? "").toLowerCase();

  const rows = db
    .select()
    .from(outreach)
    .where(
      and(
        isNotNull(outreach.sentAt),
        isNull(outreach.repliedAt),
        isNotNull(outreach.gmailThreadId),
      ),
    )
    .all();

  let found = 0;
  for (const row of rows) {
    try {
      const messages = await getThread(row.gmailThreadId!);
      const sentMs = Date.parse(row.sentAt!);
      const hasReply = messages.some(
        (m) =>
          m.internalDate > sentMs &&
          (!me || !m.from.toLowerCase().includes(me)),
      );
      if (hasReply) {
        markReplied(row.id);
        found++;
      }
    } catch {
      // One bad thread never kills the sweep.
    }
  }
  return { checked: rows.length, found };
}
