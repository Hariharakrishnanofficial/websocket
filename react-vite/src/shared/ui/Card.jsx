export function Card({ className = '', children, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={`bg-surface border border-border rounded-2xl shadow-card ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
export default Card;
