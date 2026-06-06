import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage.js';
import { defaultServerURL } from '../services/RobotClient.js';

/**
 * Persisted user preferences. Schema-versioned for forward compatibility.
 *
 * NOTE: timing constants (heartbeat, dedupe, watchdog) are deliberately
 * NOT here — they are part of the protocol contract and editing them at
 * runtime would break the cross-layer invariant.
 */
const SCHEMA_VERSION = 1;

export const useSettingsStore = create(
  persist(
    (set) => ({
      serverURL: defaultServerURL(),

      reconnect: {
        enabled: true,
        maxBackoffMs: 8000,
      },

      controller: {
        sensitivity: 0.5,     // cosmetic — reserved for future analog input
      },

      ui: {
        theme: 'dark',        // 'dark' | 'auto'
        vibration: true,
        sound: false,
        debugMode: false,
      },

      // setters
      setServerURL: (serverURL) => set({ serverURL }),
      setReconnect: (patch) =>
        set((s) => ({ reconnect: { ...s.reconnect, ...patch } })),
      setController: (patch) =>
        set((s) => ({ controller: { ...s.controller, ...patch } })),
      setUI: (patch) =>
        set((s) => ({ ui: { ...s.ui, ...patch } })),
    }),
    {
      name: 'pwa.settings.v1',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({
        serverURL: s.serverURL,
        reconnect: s.reconnect,
        controller: s.controller,
        ui: s.ui,
      }),
    }
  )
);
