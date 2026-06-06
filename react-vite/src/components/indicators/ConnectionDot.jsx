import { useConnectionStore } from '../../stores/connectionStore.js';

export function ConnectionDot({ size = 10, withLabel = false }) {
  const status      = useConnectionStore((s) => s.status);
  const robotOnline = useConnectionStore((s) => s.robotOnline);

  const color =
    status === 'connecting'   ? 'bg-warn animate-pulse2' :
    status === 'disconnected' ? 'bg-danger' :
    robotOnline               ? 'bg-success' : 'bg-warn';

  const label =
    status === 'connecting'   ? 'Connecting' :
    status === 'disconnected' ? 'Offline'    :
    robotOnline               ? 'Online'     : 'Relay only';

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`rounded-full ${color}`}
        style={{ width: size, height: size }}
        aria-label={`connection ${label}`}
      />
      {withLabel && <span className="text-xs text-muted">{label}</span>}
    </span>
  );
}
export default ConnectionDot;
