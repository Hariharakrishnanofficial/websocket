import { useEffect, useState } from 'react';
import { useConnectionStore } from '../../stores/connectionStore.js';

function format(ms) {
  if (ms == null || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

export function UptimeClock() {
  const started = useConnectionStore((s) => s.uptimeStartedAt);
  const [, force] = useState(0);

  useEffect(() => {
    if (!started) return undefined;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [started]);

  return <span className="font-mono text-text">{started ? format(Date.now() - started) : '—'}</span>;
}
export default UptimeClock;
