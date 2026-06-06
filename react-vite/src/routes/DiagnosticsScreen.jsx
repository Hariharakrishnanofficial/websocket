import { useState } from 'react';
import { Card, Button }      from '@shared/ui';
import { LogStream }         from '../components/diagnostics/LogStream.jsx';
import { LogFilterBar }      from '../components/diagnostics/LogFilterBar.jsx';
import { ExportLogsButton }  from '../components/diagnostics/ExportLogsButton.jsx';
import { useLogStore }       from '../stores/logStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';

export default function DiagnosticsScreen() {
  const [filter, setFilter] = useState('all');
  const clear = useLogStore((s) => s.clear);

  const reconnectAttempts = useConnectionStore((s) => s.reconnectAttempts);
  const lastError         = useConnectionStore((s) => s.lastError);

  return (
    <section className="flex flex-col gap-4 p-4 max-w-xl mx-auto w-full">
      <h1 className="text-lg font-semibold">Diagnostics</h1>

      <Card className="p-4 grid grid-cols-2 gap-2 text-xs">
        <div className="text-muted">Reconnect attempts</div>
        <div className="text-text font-mono text-right">{reconnectAttempts}</div>
        <div className="text-muted">Last error</div>
        <div className="text-text font-mono text-right truncate">{lastError || '—'}</div>
      </Card>

      <Card className="p-3">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <LogFilterBar value={filter} onChange={setFilter} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={clear}>Clear</Button>
            <ExportLogsButton />
          </div>
        </div>
        <div className="bg-bg rounded-lg p-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          <LogStream filter={filter} maxRows={300} />
        </div>
      </Card>
    </section>
  );
}
