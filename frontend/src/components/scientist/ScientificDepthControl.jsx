import { useState } from 'react';
import { Layers, ArrowUpDown, ChevronRight } from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';

const STANDARD_DEPTHS = [0, 10, 20, 50, 100, 200, 500, 1000, 2000, 4000];

export default function ScientificDepthControl() {
  const { selectedDepth } = useApp();
  const dispatch = useAppDispatch();
  const [exaggeration, setExaggeration] = useState(2.5);

  const handleDepthChange = (depth) => {
    dispatch({ type: 'SET_DEPTH', payload: Math.max(0, Math.min(5500, depth)) });
  };

  return (
    <div className="p-3.5 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl text-slate-100 select-none flex flex-col gap-2.5 font-sans w-72">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Layers size={14} />
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider">
              Vertical Depth Slice
            </div>
            <div className="text-[10px] text-cyan-300 font-mono">
              Z-Axis Ingestion Layer
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 font-mono text-cyan-300 text-xs font-bold bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
          <span>{selectedDepth}</span>
          <span className="text-[10px] text-slate-400 font-sans">m</span>
        </div>
      </div>

      {/* Depth Slider & Numeric Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Level (0 – 5,000m)</span>
          <input
            type="number"
            min="0"
            max="5500"
            value={selectedDepth}
            onChange={(e) => handleDepthChange(Number(e.target.value))}
            className="w-16 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-right font-mono text-xs text-cyan-300 focus:outline-none focus:border-cyan-400"
          />
        </div>
        
        <input
          type="range"
          min="0"
          max="5000"
          step="10"
          value={selectedDepth}
          onChange={(e) => handleDepthChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-lg bg-slate-700 appearance-none cursor-pointer accent-cyan-400"
        />
      </div>

      {/* Preset Depth Level Pills */}
      <div>
        <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
          Standard Depth Horizons
        </div>
        <div className="flex flex-wrap gap-1">
          {STANDARD_DEPTHS.map((d) => (
            <button
              key={d}
              onClick={() => handleDepthChange(d)}
              className={`px-2 py-1 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                selectedDepth === d
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_8px_#00c8ff]'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
              }`}
            >
              {d === 0 ? 'Surface' : `${d}m`}
            </button>
          ))}
        </div>
      </div>

      {/* Vertical Exaggeration */}
      <div className="pt-2 border-t border-slate-800/80 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <ArrowUpDown size={11} className="text-violet-400" />
            Vertical Exaggeration
          </span>
          <span className="font-mono text-violet-300">{exaggeration}x</span>
        </div>
        <input
          type="range"
          min="1.0"
          max="10.0"
          step="0.5"
          value={exaggeration}
          onChange={(e) => setExaggeration(Number(e.target.value))}
          className="w-full h-1.5 rounded-lg bg-slate-700 appearance-none cursor-pointer accent-violet-400"
        />
      </div>
    </div>
  );
}
