export function StatCard({ label, value, unit, children, className = '' }) {
  return (
    <div className={`bg-surface border border-border rounded-xl p-3 flex flex-col gap-1 ${className}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-mono text-text">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
      {children}
    </div>
  );
}
export default StatCard;
