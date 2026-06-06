/**
 * Tactile + audible feedback. Cheap, optional, and gated by settings.
 *
 * - Vibration uses the navigator.vibrate API (Android / Chrome).
 *   Silently no-ops on iOS Safari.
 * - Sound uses a single shared WebAudio context, lazily constructed on the
 *   first interaction (required by browser autoplay policies).
 */

let _ctx = null;
function getCtx() {
  if (_ctx) return _ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { _ctx = new AC(); } catch { _ctx = null; }
  return _ctx;
}

export function vibrate(pattern) {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch { /* noop */ }
}

export function click({ freq = 880, duration = 0.04, gain = 0.04 } = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(ctx.destination);
    const t = ctx.currentTime;
    osc.start(t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.stop(t + duration + 0.01);
  } catch { /* noop */ }
}

export const feedback = { vibrate, click };
export default feedback;
