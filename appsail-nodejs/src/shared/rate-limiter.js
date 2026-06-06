/**
 * Sliding 1-second window rate limiter. Reusable per client.
 *
 * Usage:
 *   const rl = createRateLimiter(50);
 *   if (!rl.allow()) return; // dropped
 */
export function createRateLimiter(maxPerSec) {
  let windowStart = Date.now();
  let count = 0;
  return {
    allow() {
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; count = 0; }
      count += 1;
      return count <= maxPerSec;
    },
    snapshot() { return { count, windowStart }; },
  };
}
