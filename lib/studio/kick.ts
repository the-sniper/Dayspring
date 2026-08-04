// Start (or retry) a campaign stage. One tiny client helper rather than a
// fetch inlined in five components — the route contract lives in one place.
//
// The response only tells you the run STARTED. Progress arrives through the
// Convex subscription on the campaign row, which is what the Studio renders.
export type KickResult = {
  ok: boolean;
  error?: string;
  started?: boolean;
  alreadyRunning?: boolean;
  stage?: string;
};

export async function startCampaignStage(
  campaignId: string,
  opts?: { retry?: boolean },
): Promise<KickResult> {
  try {
    const res = await fetch("/api/orchestra/campaign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId, retry: opts?.retry ?? false }),
    });
    const data = (await res.json()) as KickResult;
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `Could not start (${res.status}).` };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && /failed to fetch/i.test(err.message)
          ? "Could not reach the server. Is the dev server up?"
          : `Could not start: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
