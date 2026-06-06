const TABS = [
  { key: 'all', label: 'All' },
  { key: 'tx',  label: 'TX'  },
  { key: 'rx',  label: 'RX'  },
  { key: 'sys', label: 'Sys' },
  { key: 'err', label: 'Err' },
];

export function LogFilterBar({ value, onChange }) {
  return (
    <div className="inline-flex bg-surface-2 rounded-lg p-0.5">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            value === t.key ? 'bg-accent text-black' : 'text-muted hover:text-text'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
export default LogFilterBar;
