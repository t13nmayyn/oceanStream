export default function Panel({ title, badge, children, className = '' }) {
  return (
    <div className={`bg-surface-2 border border-border rounded-lg overflow-hidden ${className}`}>
      {title && (
        <div className="flex justify-between items-center px-3 py-2 border-b border-border text-xs font-bold text-white">
          <span>{title}</span>
          {badge && <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/25 font-mono">{badge}</span>}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}
