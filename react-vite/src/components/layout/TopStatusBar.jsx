import { ConnectionDot } from '../indicators/ConnectionDot.jsx';
import { LatencyPill }   from '../indicators/LatencyPill.jsx';
import { BatteryGauge }  from '../indicators/BatteryGauge.jsx';
import { SignalBars }    from '../indicators/SignalBars.jsx';
import { useConnectionStore } from '../../stores/connectionStore.js';

export function TopStatusBar() {
  const status      = useConnectionStore((s) => s.status);
  const robotOnline = useConnectionStore((s) => s.robotOnline);
  const text =
    status === 'connecting'   ? 'Connecting…' :
    status === 'disconnected' ? 'Disconnected' :
    robotOnline               ? 'Robot online' : 'Robot offline';

  return (
    <header className="pt-safe pl-safe pr-safe">
      <div className="flex items-center justify-between px-4 py-3 bg-surface/80 backdrop-blur border-b border-border">
        <div className="flex items-center gap-2">
          <ConnectionDot size={10} />
          <span className="text-sm font-medium text-text">{text}</span>
        </div>
        <div className="flex items-center gap-3">
          <SignalBars />
          <LatencyPill />
          <BatteryGauge />
        </div>
      </div>
    </header>
  );
}
export default TopStatusBar;
