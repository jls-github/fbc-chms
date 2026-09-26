/** Tiny fixed-window in-memory limiter; fine for a single app container. */
export function rateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Returns true when the key is over the limit. */
    hit(key: string): boolean {
      const now = Date.now();
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return false;
      }
      entry.count++;
      return entry.count > limit;
    },
    reset() {
      hits.clear();
    },
  };
}
