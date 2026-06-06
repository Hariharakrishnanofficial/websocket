export function Select({ value, onChange, options, label, className = '' }) {
  return (
    <div className={`flex flex-col gap-1 py-2 ${className}`}>
      {label && <span className="text-xs uppercase tracking-wide text-muted">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
export default Select;
