/**
 * useRobotSocket
 * ----------------------------------------------------------------------------
 *  Thin React adapter: subscribes the relevant Zustand stores to the
 *  framework-agnostic RobotClient singleton. Components never touch the
 *  RobotClient directly except via the small API returned here.
 *
 *  Should be mounted ONCE at the app root (App.jsx) — mounting it elsewhere
 *  would double-subscribe the same listeners.
 */
import { useEffect } from 'react';
import { MSG } from '../shared/protocol/index.js';
import robotClient from '../services/RobotClient.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useControllerStore } from '../stores/controllerStore.js';
import { useTelemetryStore }  from '../stores/telemetryStore.js';
import { useLogStore }        from '../stores/logStore.js';
import { useSettingsStore }   from '../stores/settingsStore.js';
import { parseTelemetry }     from '../services/telemetryParser.js';

export function useRobotSocketBridge() {
  // Read once — selectors used elsewhere will reactively get updates.
  const persistedURL = useSettingsStore((s) => s.serverURL);

  useEffect(() => {
    // Sync persisted URL into the client.
    if (persistedURL) robotClient.setServerURL(persistedURL);

    const conn = useConnectionStore.getState();
    const ctrl = useControllerStore.getState();
    const tele = useTelemetryStore.getState();
    const log  = useLogStore.getState();

    conn.setServerURL(robotClient.serverURL);

    const offs = [
      robotClient.on('status', (status) => {
        useConnectionStore.getState().setStatus(status);
        useLogStore.getState().push({ dir: 'sys', msg: `status=${status}`, category: 'sys' });
      }),
      robotClient.on('robotOnline', (v) => {
        useConnectionStore.getState().setRobotOnline(v);
        useLogStore.getState().push({ dir: 'sys', msg: `robotOnline=${v}`, category: 'sys' });
      }),
      robotClient.on('tx', ({ cmd, ts }) => {
        useControllerStore.getState().recordTx(cmd, ts);
        useTelemetryStore.getState().incTx();
        useLogStore.getState().push({ dir: 'tx', msg: cmd, ts, category: 'tx' });
      }),
      robotClient.on('dedupe', ({ cmd, ts }) => {
        useTelemetryStore.getState().incDedupe();
        useLogStore.getState().push({ dir: 'sys', msg: `dedupe ${cmd}`, ts, category: 'sys' });
      }),
      robotClient.on('rx', ({ type, payload, raw, ts }) => {
        useTelemetryStore.getState().incRx();
        if (type === MSG.TELEMETRY && payload && payload.data != null) {
          const parsed = parseTelemetry(payload.data);
          if (parsed) useTelemetryStore.getState().mergeTelemetry(parsed);
          useLogStore.getState().push({
            dir: 'rx', msg: `telemetry: ${payload.data}`, ts, category: 'rx',
          });
        } else if (type === MSG.STATUS || type === MSG.WELCOME) {
          useLogStore.getState().push({
            dir: 'rx',
            msg: `${type} robot=${payload?.robotConnected ? 'on' : 'off'}`,
            ts, category: 'rx',
          });
        } else if (type === MSG.ERROR) {
          useLogStore.getState().push({
            dir: 'err', msg: `server: ${payload?.message || 'error'}`, ts, category: 'err',
          });
          useConnectionStore.getState().setError(payload?.message || 'error');
        } else {
          useLogStore.getState().push({
            dir: 'rx', msg: typeof raw === 'string' ? raw : '[binary]', ts, category: 'rx',
          });
        }
      }),
      robotClient.on('error', ({ message }) => {
        useConnectionStore.getState().setError(message);
        useLogStore.getState().push({ dir: 'err', msg: message, category: 'err' });
      }),
      robotClient.on('reconnectScheduled', ({ backoffMs, attempt }) => {
        useConnectionStore.getState().incReconnect();
        useLogStore.getState().push({
          dir: 'sys', msg: `reconnect #${attempt} in ${backoffMs}ms`, category: 'sys',
        });
      }),
      robotClient.on('heartbeat', ({ cmd, ts }) => {
        useLogStore.getState().push({ dir: 'tx', msg: `${cmd} (hb)`, ts, category: 'tx' });
      }),
      robotClient.on('activeCmd', (cmd) => {
        useControllerStore.getState().setActive(cmd);
      }),
      robotClient.on('urlChanged', (url) => {
        useConnectionStore.getState().setServerURL(url);
      }),
    ];

    // Suppress unused vars: ctrl/tele/log were captured for clarity; the
    // getState() pattern above ensures we never close over stale slices.
    void ctrl; void tele; void log;

    robotClient.start();
    return () => { for (const off of offs) off(); };
    // Intentionally only run once. URL updates flow via the dedicated effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push URL changes from settings into the client.
  useEffect(() => {
    if (persistedURL && persistedURL !== robotClient.serverURL) {
      robotClient.setServerURL(persistedURL);
    }
  }, [persistedURL]);
}

export default useRobotSocketBridge;
