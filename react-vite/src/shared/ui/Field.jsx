export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1 py-2 ${className}`}>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function TextInput({ className = '', ...rest }) {
  return (
    <input
      className={`bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-accent ${className}`}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      {...rest}
    />
  );
}

export default Field;
