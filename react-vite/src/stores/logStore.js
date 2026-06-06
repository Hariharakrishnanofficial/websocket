import { create } from 'zustand';

/**
 * Ring-buffer log store. Capped to LOG_CAP entries so the controller screen
 * stays at 60 FPS even under burst load (heartbeat + telemetry + reconnects).
 *
 * Writes are RAF-batched: many push() calls in the same frame collapse into
 * a single state update, which keeps Zustand subscribers (Diagnostics screen)
 * cheap.
 */
const LOG_CAP = 1000;

let pending = [];
let rafScheduled = false;

export const useLogStore = create((set, get) => ({
  entries: [],

  push: (entry) => {
    const e = {
      ts: entry.ts || Date.now(),
      dir: entry.dir || 'sys',     // 'tx' | 'rx' | 'sys' | 'err'
      msg: entry.msg || '',
      category: entry.category || entry.dir || 'sys',
      meta: entry.meta || null,
    };
    pending.push(e);
    if (rafScheduled) return;
    rafScheduled = true;
    const flush = () => {
      rafScheduled = false;
      if (!pending.length) return;
      const toAdd = pending;
      pending = [];
      set((s) => {
        const next = s.entries.concat(toAdd);
        if (next.length > LOG_CAP) next.splice(0, next.length - LOG_CAP);
        return { entries: next };
      });
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(flush);
    } else {
      setTimeout(flush, 16);
    }
  },

  clear: () => set({ entries: [] }),

  export: () => {
    const entries = get().entries;
    const meta = {
      exportedAt: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      count: entries.length,
    };
    const ndjson = [JSON.stringify({ kind: 'meta', ...meta })]
      .concat(entries.map((e) => JSON.stringify(e)))
      .join('\n');
    return ndjson;
  },
}));

export { LOG_CAP };
