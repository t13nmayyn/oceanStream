export default function TestCard({ endpoint, status, active, onClick }) {
  const methodColor = {
    GET: 'bg-accent/20 text-accent',
    POST: 'bg-green/20 text-green',
    WS: 'bg-accent-2/25 text-accent-2',
  }[endpoint.method] || 'bg-surface-3 text-text';

  const statusBadge = {
    READY: 'bg-white/5 text-muted',
    RUNNING: 'bg-amber/20 text-amber animate-pulse',
    SUCCESS: 'bg-green/20 text-green',
    FAILED: 'bg-rose/20 text-rose',
  }[status?.state || 'READY'];

  return (
    <div
      onClick={onClick}
      className={`p-2.5 rounded-lg border transition-all cursor-pointer text-xs ${
        active
          ? 'bg-surface-3 border-accent ring-1 ring-accent/30'
          : 'bg-surface-2 border-border hover:border-accent hover:-translate-y-0.5'
      }`}
    >
      <div className="flex justify-between items-center mb-1">
        <span className={`font-mono text-[0.65rem] font-bold px-1.5 py-0.5 rounded ${methodColor}`}>
          {endpoint.method}
        </span>
        <span className="font-mono text-white font-semibold text-xs truncate max-w-[240px]">
          {endpoint.path.split('?')[0]}
        </span>
        <span className={`font-mono text-[0.65rem] font-bold px-1.5 py-0.5 rounded ${statusBadge}`}>
          {status?.code || status?.state || 'READY'}
        </span>
      </div>
      <div className="text-[0.68rem] text-muted truncate">
        {endpoint.desc}
      </div>
    </div>
  );
}
