import { create } from 'zustand';

/**
 * Reflects the live WebSocket state. Driven by RobotClient events.
 */
export const useConnectionStore = create((set) => ({
  status: 'connecting',        // 'connecting' | 'connected' | 'disconnected'
  robotOnline: false,
  serverURL: '',
  uptimeStartedAt: null,       // Date.now() when status flipped to 'connected'
  reconnectAttempts: 0,
  lastError: null,

  setStatus: (status) => set((s) => {
    const next = { status };
    if (status === 'connected' && s.status !== 'connected') {
      next.uptimeStartedAt = Date.now();
      next.reconnectAttempts = 0;
    }
    if (status === 'disconnected' && s.status === 'connected') {
      next.uptimeStartedAt = null;
    }
    return next;
  }),
  setRobotOnline: (v) => set({ robotOnline: !!v }),
  setServerURL:   (u) => set({ serverURL: u }),
  setError:       (msg) => set({ lastError: msg }),
  incReconnect:   () => set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 })),
  resetError:     () => set({ lastError: null }),
}));
