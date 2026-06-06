export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-xl px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';
  const variants = {
    primary:  'bg-accent text-black hover:bg-accent/90',
    ghost:    'bg-transparent text-text hover:bg-surface-2 border border-border',
    danger:   'bg-danger text-white hover:bg-danger/90',
    subtle:   'bg-surface-2 text-text hover:bg-border',
  };
  return (
    <button className={`${base} ${variants[variant] || ''} ${className}`} {...rest}>
      {children}
    </button>
  );
}
export default Button;
