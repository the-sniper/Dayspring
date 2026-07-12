// Shared by the server query layer/actions AND the client pager UI —
// must stay dependency-free (a client import of lib/contacts/query would
// drag better-sqlite3 into the browser bundle).

// Selectable page sizes for the Warm Network browse grid. Default is a 4×3
// grid; the others keep the same 4-column layout with more rows.
export const CONTACTS_PAGE_SIZES = [12, 24, 48] as const;
export const CONTACTS_PAGE_SIZE = CONTACTS_PAGE_SIZES[0];

export function normalizeContactsPageSize(size: number): number {
  return (CONTACTS_PAGE_SIZES as readonly number[]).includes(size)
    ? size
    : CONTACTS_PAGE_SIZE;
}
