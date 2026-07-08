export function hasHappenstanceKey(): boolean {
  return !!process.env.HAPPENSTANCE_API_KEY;
}

const BASE = "https://api.happenstance.ai";

// Bearer hpn_ key. Search + research are async jobs (see pollUntilDone).
export async function hpFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const key = process.env.HAPPENSTANCE_API_KEY;
  if (!key) throw new Error("HAPPENSTANCE_API_KEY is not set");

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (res.status === 402) {
    throw new Error("Out of Happenstance credits — top up at happenstance.ai.");
  }
  if (res.status === 429) {
    throw new Error("Happenstance is busy (10+ concurrent requests) — retry in a moment.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `happenstance/${path}: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}

// Search and research return a job that runs server-side; poll the GET endpoint
// until status leaves RUNNING. statusOf pulls the status field from either shape.
export async function pollUntilDone<T extends { status?: string }>(
  getPath: string,
  { intervalMs = 1500, timeoutMs = 60_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  // First poll immediately — fast jobs may already be done.
  for (;;) {
    const data = await hpFetch<T>("GET", getPath);
    const status = (data.status ?? "COMPLETED").toUpperCase();
    if (status !== "RUNNING") return data;
    if (Date.now() > deadline) {
      throw new Error("Happenstance request timed out — try again.");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export type HappenstanceUsage = {
  balance: number | null;
};

export async function getUsage(): Promise<HappenstanceUsage> {
  try {
    const data = await hpFetch<Record<string, unknown>>("GET", "/v1/usage");
    // Field name varies across accounts; probe the common shapes.
    const balance =
      (data.credits_remaining as number) ??
      (data.balance as number) ??
      (data.remaining as number) ??
      ((data.credits as Record<string, unknown>)?.remaining as number) ??
      null;
    return { balance: typeof balance === "number" ? balance : null };
  } catch {
    return { balance: null };
  }
}
