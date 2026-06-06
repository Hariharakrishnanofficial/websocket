import { useMemo } from 'react';
import { useLogStore } from '../../stores/logStore.js';

const COLOR = {
  tx:  'text-accent',
  rx:  'text-success',
  sys: 'text-muted',
  err: 'text-danger',
};

function formatTs(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false }) +
         '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function LogStream({ filter = 'all', maxRows = 200 }) {
  const entries = useLogStore((s) => s.entries);

  const filtered = useMemo(() => {
    const list = filter === 'all'
      ? entries
      : entries.filter((e) => e.dir === filter);
    // newest first
    return list.slice(-maxRows).reverse();
  }, [entries, filter, maxRows]);

  if (!filtered.length) {
    return <div className="text-xs text-muted font-mono py-4 text-center">no entries</div>;
  }

  return (
    <ul className="font-mono text-[11px] leading-snug">
      {filtered.map((e, i) => (
        <li key={`${e.ts}-${i}`} className="flex gap-2 py-0.5 border-b border-border/30 last:border-b-0">
          <span className="text-muted shrink-0">{formatTs(e.ts)}</span>
          <span className={`shrink-0 ${COLOR[e.dir] || 'text-muted'}`}>
            {e.dir.toUpperCase().padEnd(3)}
          </span>
          <span className="text-text break-all">{e.msg}</span>
        </li>
      ))}
    </ul>
  );
}
export default LogStream;
