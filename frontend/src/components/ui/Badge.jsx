export default function Badge({ children, className = '' }) {
  return (
    <span className={`text-[0.65rem] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/25 font-mono ${className}`}>
      {children}
    </span>
  );
}
