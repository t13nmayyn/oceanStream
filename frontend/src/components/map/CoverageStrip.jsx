import { useApp } from '../../context/AppContext';

export default function CoverageStrip() {
  const { depthMax } = useApp();
  const activeBuckets = Math.max(1, Math.ceil(depthMax / 2));

  return (
    <div className="absolute bottom-5 left-5 right-52 bg-surface/90 border border-border rounded-lg px-3 py-2 z-40 backdrop-blur-md">
      <div className="flex justify-between text-xs text-muted mb-1.5 font-mono">
        <span>Viewport Depth Range: <strong className="text-accent">0–{depthMax.toFixed(0)}m</strong></span>
        <span className="text-green">100% Resident in L1/L2</span>
      </div>
      <div className="flex gap-0.5 h-2.5">
        {Array.from({ length: 25 }, (_, i) => {
          const isActive = i < activeBuckets;
          return (
            <div
              key={i}
              className={`flex-1 rounded-xs transition-all ${
                isActive ? 'bg-green' : 'bg-surface-3 border border-border/50'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
