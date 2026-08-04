// The content calendar — pure code, no model call.
//
// Two rules, both learned the expensive way by every content operation: post
// on weekdays, and never put two posts from the same pillar back to back. The
// second is what stops a week reading like one long monologue about one thing.

export type Slottable = { topicId: string; pillar: string };

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The next `count` weekday dates, starting the day after `fromDate`. */
export function weekdaySlots(fromDate: string, count: number): string[] {
  const out: string[] = [];
  let cursor = fromDate;
  let guard = 0;
  while (out.length < count && guard < 120) {
    cursor = addDays(cursor, 1);
    guard += 1;
    if (!isWeekend(new Date(`${cursor}T00:00:00Z`))) out.push(cursor);
  }
  return out;
}

/**
 * Interleave by pillar, then drop onto weekday slots.
 *
 * Round-robin over the pillar buckets rather than sorting: sorting by pillar
 * groups them, which is the exact thing we're avoiding. With one pillar
 * dominating, the best achievable is "spread out", and that's what this gives.
 */
export function scheduleByPillar(
  items: Slottable[],
  fromDate: string,
): { topicId: string; date: string }[] {
  const buckets = new Map<string, Slottable[]>();
  for (const it of items) {
    const key = it.pillar || "Uncategorised";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(it);
  }
  // Biggest bucket first so the dominant pillar gets the widest spacing.
  const queues = [...buckets.values()].sort((a, b) => b.length - a.length);
  const order: Slottable[] = [];
  let placed = 0;
  while (placed < items.length) {
    for (const q of queues) {
      const next = q.shift();
      if (next) {
        order.push(next);
        placed += 1;
      }
    }
  }
  const slots = weekdaySlots(fromDate, order.length);
  return order.map((it, i) => ({ topicId: it.topicId, date: slots[i] }));
}
