import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// Every app function scopes to the signed-in user. Queries/mutations that
// reach Convex without a valid JWT get a hard error — there is no anonymous
// data access.
export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not signed in.");
  return userId;
}

// For direct-by-id reads: a row belonging to another user is treated as
// nonexistent (404 semantics, no information leak).
export function owned<T extends { userId?: Id<"users"> }>(
  row: T | null,
  userId: Id<"users">,
): T | null {
  return row && row.userId === userId ? row : null;
}
