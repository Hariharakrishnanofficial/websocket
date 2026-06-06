/**
 * Suppresses identical consecutive values arriving within `windowMs`.
 * Pass-through values listed in `passThrough` are never deduped (e.g. 'S').
 */
export function createDeduper(windowMs, passThrough = new Set()) {
  let last = null;
  let lastAt = 0;
  let droppedCount = 0;
  return {
    accept(value) {
      const now = Date.now();
      if (passThrough.has(value)) { last = value; lastAt = now; return true; }
      if (value === last && (now - lastAt) < windowMs) {
        droppedCount += 1; return false;
      }
      last = value; lastAt = now;
      return true;
    },
    droppedCount: () => droppedCount,
  };
}
