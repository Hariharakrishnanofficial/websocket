import { useTelemetryStore } from '../../stores/telemetryStore.js';

/** Convert dBm RSSI to a 0–4 bar count (rough). */
function rssiToBars(rssi) {
  if (rssi == null) return -1;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
}

export function SignalBars() {
  const rssi = useTelemetryStore((s) => s.rssi);
  const bars = rssiToBars(rssi);
  return (
    <div className="inline-flex items-end gap-0.5 h-3" aria-label="signal">
      {[0, 1, 2, 3].map((i) => {
        const active = bars > i;
        const h = 4 + i * 2;
        return (
          <span
            key={i}
            className={`w-1 rounded-sm ${active ? 'bg-accent' : 'bg-border'}`}
            style={{ height: h }}
          />
        );
      })}
    </div>
  );
}
export default SignalBars;
