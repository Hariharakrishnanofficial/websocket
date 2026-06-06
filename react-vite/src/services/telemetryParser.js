/**
 * Telemetry parser — best-effort decoder for the optional `data` payload
 * that the relay wraps in `{"type":"telemetry","data":"..."}`.
 *
 * The firmware may emit:
 *  - JSON object        : {"rssi":-62,"bat":78,"v":7.4,"motion":"F"}
 *  - key=value pairs    : "rssi=-62 bat=78 v=7.4 motion=F"
 *  - free-form text     : "[motion] FORWARD"
 *
 * Unknown fields are ignored. We NEVER throw — telemetry is opt-in.
 */

const NUM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parseKv(text) {
  const out = {};
  for (const tok of text.split(/\s+/)) {
    const eq = tok.indexOf('=');
    if (eq <= 0) continue;
    const k = tok.slice(0, eq).trim().toLowerCase();
    const v = tok.slice(eq + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

function normalize(obj) {
  // Accept many key spellings — firmwares evolve faster than schemas.
  const rssi    = NUM(obj.rssi ?? obj.signal);
  const battery = NUM(obj.bat ?? obj.battery ?? obj.batt ?? obj.soc);
  const voltage = NUM(obj.v ?? obj.volt ?? obj.voltage ?? obj.vbat);
  const motion  = (obj.motion ?? obj.dir ?? obj.cmd ?? '').toString().toUpperCase() || null;
  const result = {};
  if (rssi    !== null) result.rssi    = rssi;
  if (battery !== null) result.battery = battery;
  if (voltage !== null) result.voltage = voltage;
  if (motion)           result.currentMotion = motion;
  return Object.keys(result).length ? result : null;
}

export function parseTelemetry(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  // Try JSON first
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') return normalize(obj);
    } catch { /* fall through */ }
  }

  // Try key=value
  if (text.includes('=')) {
    const obj = parseKv(text);
    const norm = normalize(obj);
    if (norm) return norm;
  }

  // Free-form: extract a motion hint if mentioned
  const m = /\b(FORWARD|BACKWARD|LEFT|RIGHT|STOP)\b/i.exec(text);
  if (m) {
    const map = { FORWARD: 'F', BACKWARD: 'B', LEFT: 'L', RIGHT: 'R', STOP: 'S' };
    return { currentMotion: map[m[1].toUpperCase()] };
  }
  return null;
}

export default parseTelemetry;
