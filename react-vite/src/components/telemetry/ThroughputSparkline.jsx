import { useTelemetryStore, THROUGHPUT_BUCKETS } from '../../stores/telemetryStore.js';

export function ThroughputSparkline({ width = 120, height = 28 }) {
  const buckets = useTelemetryStore((s) => s.throughput);
  if (!buckets.length) {
    return <div className="text-xs text-muted">no traffic</div>;
  }

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const stride = width / THROUGHPUT_BUCKETS;
  // Right-align the live data
  const offset = THROUGHPUT_BUCKETS - buckets.length;
  const points = buckets.map((b, i) => {
    const x = (i + offset) * stride;
    const y = height - (b.count / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
export default ThroughputSparkline;
