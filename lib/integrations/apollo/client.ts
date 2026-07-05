export function hasApolloKey(): boolean {
  return !!process.env.APOLLO_API_KEY;
}

// Bearer per current docs; some Apollo accounts still authenticate with the
// X-Api-Key header, so retry once on 401 before surfacing the error.
export async function apolloFetch<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY is not set");

  const attempt = (auth: Record<string, string>) =>
    fetch(`https://api.apollo.io/api/v1/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...auth,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

  let res = await attempt({ authorization: `Bearer ${key}` });
  if (res.status === 401) {
    res = await attempt({ "x-api-key": key });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `apollo/${path}: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}
