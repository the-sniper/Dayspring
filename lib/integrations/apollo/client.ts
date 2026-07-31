import { getKey } from "@/lib/keys";
import { keyNotSet } from "@/lib/keys/messages";

export async function hasApolloKey(): Promise<boolean> {
  return !!(await getKey("APOLLO_API_KEY"));
}

// X-Api-Key is Apollo's documented auth header and the only one that works on
// current plans — Bearer is rejected (401 "Invalid access credentials", and on
// some accounts a 403 whose body says API_INACCESSIBLE, which reads exactly
// like a plan gate and hid a working paid key). Bearer stays as a fallback for
// legacy accounts, but it is no longer tried first.
export async function apolloFetch<T>(path: string, body: unknown): Promise<T> {
  const key = await getKey("APOLLO_API_KEY");
  if (!key) throw new Error(keyNotSet("APOLLO_API_KEY"));

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

  let res = await attempt({ "x-api-key": key });
  // 403 is included deliberately: an auth-method mismatch and a real plan gate
  // are indistinguishable from the status alone, so retry before believing it.
  if (res.status === 401 || res.status === 403) {
    res = await attempt({ authorization: `Bearer ${key}` });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `apollo/${path}: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}
