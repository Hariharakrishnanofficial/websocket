/**
 * Tiny localStorage wrapper with versioned schema.
 *
 * Used directly by zustand persist middleware (which expects a `Storage`-like
 * object) and as a generic safe getter elsewhere.
 */

const SAFE = typeof window !== 'undefined' && !!window.localStorage;

export const storage = {
  getItem(key) {
    if (!SAFE) return null;
    try { return window.localStorage.getItem(key); }
    catch { return null; }
  },
  setItem(key, value) {
    if (!SAFE) return;
    try { window.localStorage.setItem(key, value); }
    catch { /* quota / private mode — best effort only */ }
  },
  removeItem(key) {
    if (!SAFE) return;
    try { window.localStorage.removeItem(key); }
    catch { /* noop */ }
  },
};

export default storage;
