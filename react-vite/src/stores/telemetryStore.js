import { create } from 'zustand';

/**
 * Live robot telemetry + per-session counters. All fields are nullable —
 * if the firmware doesn't emit a value we show "—" rather than crash.
 *
 * Throughput is a tiny rolling window over the last ~10 seconds of TX.
 */
const THROUGHPUT_WINDOW_MS = 10_000;
const THROUGHPUT_BUCKETS   = 20;            // 500 ms each

export const useTelemetryStore = create((set, get) => ({
  rssi: null,
  battery: null,
  voltage: null,
  currentMotion: null,

  txCount: 0,
  rxCount: 0,
  dedupedCount: 0,

  // ring buffer for sparkline: array of {ts, count}
  throughput: [],

  mergeTelemetry: (patch) => set((s) => ({ ...s, ...patch })),

  incTx: () => set((s) => {
    const now = Date.now();
    const bucketMs = THROUGHPUT_WINDOW_MS / THROUGHPUT_BUCKETS;
    const bucketKey = Math.floor(now / bucketMs);
    const next = s.throughput.slice();
    const last = next[next.length - 1];
    if (last && last.bucket === bucketKey) {
      last.count += 1;
    } else {
      next.push({ bucket: bucketKey, ts: now, count: 1 });
    }
    // drop buckets older than the window
    const cutoff = now - THROUGHPUT_WINDOW_MS;
    while (next.length && next[0].ts < cutoff) next.shift();
    return { txCount: s.txCount + 1, throughput: next };
  }),

  incRx:     () => set((s) => ({ rxCount: s.rxCount + 1 })),
  incDedupe: () => set((s) => ({ dedupedCount: s.dedupedCount + 1 })),

  reset: () => set({
    rssi: null, battery: null, voltage: null, currentMotion: null,
    txCount: 0, rxCount: 0, dedupedCount: 0, throughput: [],
  }),

  // selectors / helpers
  getThroughputPerSec() {
    const t = get().throughput;
    if (!t.length) return 0;
    const totalCount = t.reduce((sum, b) => sum + b.count, 0);
    const span = Math.max(1, (Date.now() - t[0].ts) / 1000);
    return totalCount / span;
  },
}));

export { THROUGHPUT_WINDOW_MS, THROUGHPUT_BUCKETS };
