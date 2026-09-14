const variants = {
  default: 'border-border bg-surface-2 text-text hover:border-accent hover:text-accent',
  primary: 'border-accent bg-[#0077b6] text-white hover:bg-accent hover:text-black',
  danger: 'border-rose bg-rose/10 text-rose hover:bg-rose/20',
  success: 'border-green bg-green/15 text-green hover:bg-green/25',
};

export default function Button({ variant = 'default', className = '', children, ...props }) {
  return (
    <button
      className={`px-3 py-1.5 rounded-md text-xs font-semibold border cursor-pointer transition-all inline-flex items-center gap-1.5 ${variants[variant] || variants.default} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
