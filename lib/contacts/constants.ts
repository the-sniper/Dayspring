// Shared by the server query layer/actions AND the client pager UI —
// must stay dependency-free (a client import of lib/contacts/query would
// drag better-sqlite3 into the browser bundle).
export const CONTACTS_PAGE_SIZE = 60;
