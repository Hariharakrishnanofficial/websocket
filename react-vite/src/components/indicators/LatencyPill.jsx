import { useLatencyProbe } from '@shared/hooks';

export function LatencyPill() {
  const ms = useLatencyProbe();
  const cls =
    ms == null         ? 'text-muted' :
    ms < 80            ? 'text-success' :
    ms < 250           ? 'text-warn' :
                         'text-danger';
  return (
    <span className={`text-xs font-mono ${cls}`}>
      ≈ {ms == null ? '—' : `${ms} ms`}
    </span>
  );
}
export default LatencyPill;
