import { create } from 'zustand';

/**
 * UI-facing state for the controller surface. Kept tiny so the controller
 * screen rerenders only when the active command changes.
 */
export const useControllerStore = create((set) => ({
  activeCmd: null,
  lastCommand: null,
  lastCommandAt: 0,

  setActive:   (cmd) => set({ activeCmd: cmd }),
  recordTx:    (cmd, ts) => set({ lastCommand: cmd, lastCommandAt: ts || Date.now() }),
}));
