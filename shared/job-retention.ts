// Hard portal-wide retention: nothing older than JOB_MAX_AGE_DAYS may appear
// in the product. Age is postedAt when known, else createdAt (same key the
// feeds already use). Purge + read filters + ingest skips all share this.

export const JOB_MAX_AGE_DAYS = 15;

const MS_PER_DAY = 86_400_000;

export type AgedListing = {
  postedAt?: string | null;
  createdAt: string;
};

export function listingAgeIso(row: AgedListing): string {
  return row.postedAt || row.createdAt;
}

export function retentionCutoffIso(now = Date.now()): string {
  return new Date(now - JOB_MAX_AGE_DAYS * MS_PER_DAY).toISOString();
}

export function isWithinRetention(row: AgedListing, now = Date.now()): boolean {
  return listingAgeIso(row) >= retentionCutoffIso(now);
}

export function isPastRetention(row: AgedListing, now = Date.now()): boolean {
  return !isWithinRetention(row, now);
}
