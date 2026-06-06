import { useTelemetryStore } from '../../stores/telemetryStore.js';

export function BatteryGauge({ compact = true }) {
  const battery = useTelemetryStore((s) => s.battery);
  const pct = battery == null ? null : Math.max(0, Math.min(100, battery));
  const color =
    pct == null ? 'bg-border' :
    pct < 20    ? 'bg-danger' :
    pct < 40    ? 'bg-warn'   :
                  'bg-success';
  return (
    <div className="inline-flex items-center gap-2" aria-label="battery">
      <div className="relative w-7 h-3 border border-border rounded-sm overflow-hidden">
        <div className={`absolute inset-y-0 left-0 ${color}`} style={{ width: pct == null ? 0 : `${pct}%` }} />
      </div>
      {!compact && (
        <span className="text-xs font-mono text-muted">
          {pct == null ? '—' : `${Math.round(pct)}%`}
        </span>
      )}
    </div>
  );
}
export default BatteryGauge;
