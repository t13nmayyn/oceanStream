import { useApp } from '../../context/AppContext';

export default function PagingTable() {
  const { depthMax } = useApp();

  const cells = Array.from({ length: 25 }, (_, i) => {
    const d0 = i * 2;
    const isActive = d0 < depthMax;
    return (
      <div
        key={i}
        title={`Depth ${d0}–${d0 + 2}m: ${isActive ? 'ON_DISK (L2)' : 'NOT_FETCHED'}`}
        className={`h-4 rounded-sm text-[0.58rem] flex items-center justify-center font-mono cursor-pointer transition-transform hover:scale-[1.18] hover:z-10 border ${
          isActive
            ? 'bg-amber text-[#3d2600] font-bold border-amber'
            : 'bg-dark-page text-[#3b5070] border-[#1a2744]'
        }`}
      >
        {d0}
      </div>
    );
  });

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex gap-2 text-[0.68rem] flex-wrap">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-green" /><span>RESIDENT</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-amber" /><span>ON_DISK</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-orange animate-pulse" /><span>FETCHING</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-dark-page border border-border" /><span>NOT_FETCHED</span></div>
      </div>

      <div className="text-[0.68rem] text-muted mb-1">Depth Page Allocation (2m Bins):</div>
      <div className="grid grid-cols-10 gap-[3px] bg-black/30 p-1.5 rounded-md border border-border">
        {cells}
      </div>

      <div className="space-y-0.5 mt-2">
        <div className="flex justify-between text-[0.71rem] py-0.5 border-b border-white/5 text-muted font-mono">
          <span>Pages Registered:</span>
          <strong className="text-text">11,160</strong>
        </div>
        <div className="flex justify-between text-[0.71rem] py-0.5 border-b border-white/5 text-muted font-mono">
          <span>L1 RAM Hit Rate:</span>
          <strong className="text-green">100%</strong>
        </div>
      </div>
    </div>
  );
}
