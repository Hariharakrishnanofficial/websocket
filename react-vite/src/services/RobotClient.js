/**
 * RobotClient — framework-agnostic WebSocket controller for the AppSail relay.
 *
 * This is a 1:1 port of the original `useRobotSocket.js` hook logic into a
 * plain EventEmitter-style class. NO protocol semantics have been changed:
 *
 *   - heartbeat resends the held command every HEARTBEAT_MS (300 ms)
 *   - identical consecutive non-heartbeat sends inside DEDUPE_MS (250 ms) drop
 *   - STOP is NEVER deduped (force=true)
 *   - stopHold() is idempotent (safe under pointerup + pointerleave double-fire)
 *   - onclose preserves heldCmd so the user's release still emits S correctly
 *   - exponential reconnect backoff capped at 8 s
 *
 * Events:
 *   status          ('connecting' | 'connected' | 'disconnected')
 *   robotOnline     (boolean)
 *   cameraOnline    (boolean)
 *   tx              ({ cmd, ts })            — frame actually put on the wire
 *   dedupe          ({ cmd, ts })            — frame dropped by client dedupe
 *   rx              ({ type, payload, raw, ts })
 *   frame           ({ blob, bytes, ts })    — binary video frame from relay
 *   error           ({ message })
 *   reconnectScheduled ({ backoffMs, attempt })
 *   heartbeat       ({ cmd, ts })            — emitted on each heartbeat tick
 *   activeCmd       (cmd | null)
 *   urlChanged      (url)
 */

import { ROLE, MSG } from '../shared/protocol/index.js';
import {
  HEARTBEAT_MS,
  DEDUPE_MS,
  CMD,
} from './protocol.js';

/* ------------------------------------------------------------------ */
/* Default server URL resolution (mirrors original logic)             */
/* ------------------------------------------------------------------ */
export function defaultServerURL() {
  const envUrl = import.meta.env?.VITE_WS_URL;
  if (envUrl) return envUrl;
  if (typeof window === 'undefined') return 'ws://localhost:4600/ws';
  const params = new URLSearchParams(window.location.search);
  if (params.get('server')) return params.get('server');
  const host  = window.location.hostname || 'localhost';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  if (proto === 'wss') return `${proto}://${host}/ws`;
  return `${proto}://${host}:4600/ws`;
}

/* ------------------------------------------------------------------ */

class RobotClient {
  constructor() {
    /* state ----------------------------------------------------------*/
    this.serverURL    = defaultServerURL();
    this.controllerToken = import.meta.env?.VITE_CONTROLLER_TOKEN || '';
    this.status       = 'connecting';
    this.robotOnline  = false;
    this.cameraOnline = false;
    this.activeCmd    = null;

    /* internals ------------------------------------------------------*/
    this.ws           = null;
    this.retries      = 0;
    this.reconTimer   = null;
    this.heartbeatId  = null;
    this.heldCmd      = null;
    this.lastSentCmd  = null;
    this.lastSentAt   = 0;

    this.sentCount    = 0;
    this.rxCount      = 0;
    this.dedupedCount = 0;

    /* listeners ------------------------------------------------------*/
    this._listeners = new Map(); // event -> Set<fn>

    /* manual control --------------------------------------------------*/
    this._started = false;
  }

  /* ---------------- EventEmitter shim ---------------- */
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const set = this._listeners.get(event);
    if (set) set.delete(fn);
  }
  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    // copy to allow listeners to unsubscribe synchronously
    for (const fn of Array.from(set)) {
      try { fn(payload); }
      catch (e) { /* never let one listener break the bus */
        console.error('[RobotClient] listener error:', e);
      }
    }
  }

  /* ---------------- Public API ---------------- */

  start() {
    if (this._started) return;
    this._started = true;
    this._connect();
  }

  setServerURL(url) {
    if (!url || url === this.serverURL) return;
    this.serverURL = url;
    this.emit('urlChanged', url);
    this.reconnect();
  }

  reconnect() {
    this.retries = 0;
    this._stopHeartbeat();
    const ws = this.ws;
    if (ws) {
      ws.onclose = null;
      try { ws.close(); } catch { /* noop */ }
    }
    this._connect();
  }

  /**
   * Single-shot send.
   * @param {string} cmd one of F/B/L/R/S
   * @param {{force?:boolean}} opts force bypasses dedupe (STOP must use this)
   */
  sendCmd(cmd, opts = {}) {
    if (!cmd) return false;
    const force = !!opts.force;
    const now = Date.now();
    if (
      !force &&
      cmd === this.lastSentCmd &&
      now - this.lastSentAt < DEDUPE_MS
    ) {
      this.dedupedCount += 1;
      this.emit('dedupe', { cmd, ts: now });
      return false;
    }
    return this._rawSend(cmd);
  }

  startHold(cmd) {
    if (!cmd) return;
    if (this.heldCmd === cmd) return;          // same direction already held
    this._stopHeartbeat();                     // direction swap (no STOP between)

    this.heldCmd = cmd;
    this.activeCmd = cmd;
    this.emit('activeCmd', cmd);

    this._rawSend(cmd);

    this.heartbeatId = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== 1 /* OPEN */) {
        this._stopHeartbeat();
        return;
      }
      const held = this.heldCmd;
      if (!held) {
        this._stopHeartbeat();
        return;
      }
      this._rawSend(held);
      this.emit('heartbeat', { cmd: held, ts: Date.now() });
    }, HEARTBEAT_MS);
  }

  stopHold() {
    // Idempotent: don't early-return when heldCmd is null. pointerup +
    // pointerleave can both fire, and both must be safe to invoke.
    const wasHolding = this.heldCmd != null;
    this._stopHeartbeat();
    if (wasHolding) {
      // Force-send so the release is never swallowed by the dedupe window.
      this._rawSend(CMD.S);
      this.lastSentCmd = null; // unblock next press of any direction
    }
  }

  /**
   * Hard emergency stop. Bypasses everything, sends STOP immediately, and
   * also disarms any active hold so the heartbeat does not re-issue motion.
   */
  emergencyStop() {
    // 1. clear any held state so the heartbeat dies
    this._stopHeartbeat();
    // 2. force-push S regardless of last-sent state
    this.lastSentCmd = null;
    this.sendCmd(CMD.S, { force: true });
  }

  /* ---------------- Internals ---------------- */

  _rawSend(cmd) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1 /* OPEN */) return false;
    try { ws.send(cmd); }
    catch (e) {
      this.emit('error', { message: `send failed: ${e.message}` });
      return false;
    }
    this.sentCount += 1;
    this.lastSentCmd = cmd;
    this.lastSentAt  = Date.now();
    this.emit('tx', { cmd, ts: this.lastSentAt });
    return true;
  }

  _stopHeartbeat() {
    if (this.heartbeatId) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
    if (this.heldCmd != null) {
      this.heldCmd = null;
      this.activeCmd = null;
      this.emit('activeCmd', null);
    }
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status);
  }
  _setRobotOnline(v) {
    const next = !!v;
    if (this.robotOnline === next) return;
    this.robotOnline = next;
    this.emit('robotOnline', next);
  }
  _setCameraOnline(v) {
    const next = !!v;
    if (this.cameraOnline === next) return;
    this.cameraOnline = next;
    this.emit('cameraOnline', next);
  }

  _connect() {
    clearTimeout(this.reconTimer);
    this._setStatus('connecting');

    let ws;
    try {
      ws = new WebSocket(this.serverURL);
    } catch (e) {
      this.emit('error', { message: `bad URL: ${e.message}` });
      this._setStatus('disconnected');
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this._setStatus('connected');
      const reg = { type: ROLE.CONTROLLER };
      if (this.controllerToken) reg.token = this.controllerToken;
      try { ws.send(JSON.stringify(reg)); } catch { /* noop */ }
    };

    ws.onmessage = (ev) => {
      this.rxCount += 1;
      const ts = Date.now();
      const data = ev.data;

      // Binary frame -> video. Browser delivers Blob by default; some test
      // environments deliver ArrayBuffer. Normalise to Blob so consumers can
      // pipe straight into createImageBitmap().
      if (data instanceof ArrayBuffer || data instanceof Blob) {
        const blob = data instanceof Blob
          ? data
          : new Blob([data], { type: 'image/jpeg' });
        this.emit('frame', { blob, bytes: blob.size, ts });
        return;
      }

      let msg = null;
      try { msg = JSON.parse(data); } catch { /* non-JSON: ignore */ }
      if (msg && typeof msg === 'object') {
        if (msg.type === MSG.WELCOME || msg.type === MSG.STATUS) {
          this._setRobotOnline(!!msg.robotConnected);
          // cameraConnected may be absent in older relay builds — only
          // update when the relay actually reports it.
          if (Object.prototype.hasOwnProperty.call(msg, 'cameraConnected')) {
            this._setCameraOnline(!!msg.cameraConnected);
          }
        }
        this.emit('rx', { type: msg.type || 'unknown', payload: msg, raw: data, ts });
      } else {
        this.emit('rx', { type: 'raw', payload: null, raw: data, ts });
      }
    };

    ws.onerror = () => {
      this.emit('error', { message: 'socket error' });
    };

    ws.onclose = () => {
      // Kill heartbeat timer but PRESERVE heldCmd so release still works.
      if (this.heartbeatId) {
        clearInterval(this.heartbeatId);
        this.heartbeatId = null;
      }
      this._setStatus('disconnected');
      this._setRobotOnline(false);
      this._setCameraOnline(false);
      this._scheduleReconnect();
    };
  }

  _scheduleReconnect() {
    const backoff = Math.min(1000 * 2 ** this.retries, 8000);
    this.retries += 1;
    this.emit('reconnectScheduled', { backoffMs: backoff, attempt: this.retries });
    this.reconTimer = setTimeout(() => this._connect(), backoff);
  }
}

/* Singleton — one socket per page, period. */
const robotClient = new RobotClient();
export default robotClient;
export { RobotClient };
