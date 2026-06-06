export function Slider({ value, min = 0, max = 1, step = 0.01, onChange, label, format }) {
  const display = format ? format(value) : value;
  return (
    <div className="flex flex-col gap-1 py-2">
      {label && (
        <div className="flex justify-between text-xs text-muted">
          <span className="uppercase tracking-wide">{label}</span>
          <span className="font-mono text-text">{display}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}
export default Slider;
