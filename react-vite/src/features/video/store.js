import { create } from 'zustand';

/**
 * Live video pipeline state.
 *
 * Frames are NOT stored here — they're delivered to <VideoStream/> via the
 * RobotClient `frame` event, decoded straight onto a canvas, and discarded.
 * This store only holds the slow-moving metadata the UI renders alongside
 * the canvas (FPS / latency / connection state).
 */
export const useVideoStore = create((set) => ({
  cameraOnline: false,
  fps:          0,          // frames decoded in the last 1 s window
  bytesPerSec:  0,
  lastFrameAt:  0,          // ms epoch
  decodeMs:     0,          // last decode time, smoothed
  errors:       0,

  setCameraOnline: (v) => set({ cameraOnline: !!v }),
  setStats: (stats)    => set((s) => ({ ...s, ...stats })),
  bumpError:           () => set((s) => ({ errors: s.errors + 1 })),
  reset: () => set({
    cameraOnline: false,
    fps: 0, bytesPerSec: 0, lastFrameAt: 0, decodeMs: 0, errors: 0,
  }),
}));
