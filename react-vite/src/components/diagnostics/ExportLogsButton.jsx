import { useLogStore } from '../../stores/logStore.js';
import { Button } from '@shared/ui';

export function ExportLogsButton() {
  const exportFn = useLogStore((s) => s.export);
  const onClick = () => {
    const ndjson = exportFn();
    const blob = new Blob([ndjson], { type: 'application/x-ndjson' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robot-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <Button variant="ghost" onClick={onClick}>Export NDJSON</Button>;
}
export default ExportLogsButton;
