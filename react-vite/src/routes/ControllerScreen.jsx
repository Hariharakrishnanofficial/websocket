import { DirectionPad }      from '../components/controller/DirectionPad.jsx';
import { EmergencyStop }     from '../components/controller/EmergencyStop.jsx';
import { ActiveCommandBadge } from '../components/controller/ActiveCommandBadge.jsx';
import { VideoStream }        from '@features/video';
import { useKeyboardControl, useWakeLock } from '@shared/hooks';
import { useConnectionStore } from '../stores/connectionStore.js';
import { useEffect } from 'react';
import robotClient from '../services/RobotClient.js';

export default function ControllerScreen() {
  useKeyboardControl(true);
  useWakeLock(true);

  // Safety: if the tab is hidden / app backgrounded, force STOP. This is the
  // last line of defense in addition to the firmware watchdog.
  useEffect(() => {
    const stopAll = () => robotClient.emergencyStop();
    const onVis = () => {
      if (document.visibilityState !== 'visible') stopAll();
    };
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', stopAll);
    window.addEventListener('blur', stopAll);
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', stopAll);
      window.removeEventListener('blur', stopAll);
    };
  }, []);

  const status      = useConnectionStore((s) => s.status);
  const robotOnline = useConnectionStore((s) => s.robotOnline);
  const disabled    = status !== 'connected';

  return (
    <section className="flex flex-col gap-4 p-4 pb-2 max-w-xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold leading-tight">Drive</h1>
          <p className="text-xs text-muted">Hold a direction to move · release to stop</p>
        </div>
        <ActiveCommandBadge />
      </div>

      {!robotOnline && status === 'connected' && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 text-warn text-xs px-3 py-2">
          Relay connected, but the robot is offline. Commands will fail.
        </div>
      )}

      <VideoStream />

      <DirectionPad disabled={disabled} />

      <div className="mt-2">
        <EmergencyStop disabled={disabled} />
      </div>

      <p className="text-[11px] text-muted text-center mt-1">
        Keyboard: ↑ ↓ ← → / WASD · Space = STOP
      </p>
    </section>
  );
}
