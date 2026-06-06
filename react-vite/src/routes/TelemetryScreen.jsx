import { StatCard }            from '../components/telemetry/StatCard.jsx';
import { UptimeClock }         from '../components/telemetry/UptimeClock.jsx';
import { ThroughputSparkline } from '../components/telemetry/ThroughputSparkline.jsx';
import { Card }                from '@shared/ui';
import { useTelemetryStore }   from '../stores/telemetryStore.js';
import { useControllerStore }  from '../stores/controllerStore.js';
import { useConnectionStore }  from '../stores/connectionStore.js';
import { CMD_LABEL }           from '../services/protocol.js';

const dash = (v, fix = 0) => (v == null || Number.isNaN(v)) ? '—' : Number(v).toFixed(fix);

export default function TelemetryScreen() {
  const rssi    = useTelemetryStore((s) => s.rssi);
  const battery = useTelemetryStore((s) => s.battery);
  const voltage = useTelemetryStore((s) => s.voltage);
  const motion  = useTelemetryStore((s) => s.currentMotion);
  const txCount = useTelemetryStore((s) => s.txCount);
  const rxCount = useTelemetryStore((s) => s.rxCount);
  const deduped = useTelemetryStore((s) => s.dedupedCount);
  const lastCmd = useControllerStore((s) => s.lastCommand);
  const status  = useConnectionStore((s) => s.status);
  const robot   = useConnectionStore((s) => s.robotOnline);

  return (
    <section className="flex flex-col gap-4 p-4 max-w-xl mx-auto w-full">
      <h1 className="text-lg font-semibold">Telemetry</h1>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted">Connection</div>
          <div className="text-sm font-medium">{status} · robot {robot ? 'online' : 'offline'}</div>
          <div className="text-xs text-muted mt-1">Uptime: <UptimeClock /></div>
        </div>
        <ThroughputSparkline />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="RSSI"    value={dash(rssi, 0)} unit="dBm" />
        <StatCard label="Battery" value={dash(battery, 0)} unit="%" />
        <StatCard label="Voltage" value={dash(voltage, 2)} unit="V" />
        <StatCard label="Motion"  value={motion ? (CMD_LABEL[motion] || motion) : '—'} />
        <StatCard label="Last cmd" value={lastCmd ? (CMD_LABEL[lastCmd] || lastCmd) : '—'} />
        <StatCard label="TX"      value={txCount} />
        <StatCard label="RX"      value={rxCount} />
        <StatCard label="Deduped" value={deduped} />
      </div>
    </section>
  );
}
