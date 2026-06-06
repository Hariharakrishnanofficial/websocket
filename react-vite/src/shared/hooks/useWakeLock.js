/**
 * useWakeLock — keep the screen on while the controller screen is mounted.
 *
 * Quietly no-ops on browsers without the Wake Lock API (notably iOS Safari).
 */
import { useEffect } from 'react';

export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof navigator === 'undefined') return undefined;
    if (!('wakeLock' in navigator)) return undefined;

    let sentinel = null;
    let released = false;

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        sentinel.addEventListener?.('release', () => { sentinel = null; });
      } catch { /* user denied / unsupported */ }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel && !released) {
        request();
      }
    };

    request();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) {
        try { sentinel.release(); } catch { /* noop */ }
        sentinel = null;
      }
    };
  }, [enabled]);
}

export default useWakeLock;
