// Concurrency-limited async map. Runs `fn` over `items` with at most `limit`
// in flight at once, preserving input order in the results. Unlike
// Promise.all(items.map(fn)), this won't fire hundreds of ATS requests
// simultaneously when the watched-company set grows large.
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length || 1));

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}
