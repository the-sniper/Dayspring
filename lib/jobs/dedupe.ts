import { createHash } from "node:crypto";

// Fallback dedupe for sources without stable external ids (manual/csv/paste)
// and cross-source repeats. ATS pulls also carry UNIQUE(source, externalId).
export function dedupeKey(
  companyId: number,
  title: string,
  url?: string | null,
) {
  return createHash("sha256")
    .update(`${companyId}|${title.trim().toLowerCase()}|${url ?? ""}`)
    .digest("hex");
}
