import { useState } from 'react';
import { Layers, ArrowUpDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp, useAppDispatch } from '../../context/AppContext';

const STANDARD_DEPTHS = [
  { depth: 0, label: '0m (Sfc)' },
  { depth: 10, label: '10m' },
  { depth: 20, label: '20m' },
  { depth: 50, label: '50m' },
  { depth: 100, label: '100m' },
  { depth: 200, label: '200m' },
  { depth: 500, label: '500m' },
  { depth: 1000, label: '1000m' },
  { depth: 2000, label: '2000m' },
  { depth: 4000, label: '4000m' },
];

export default function ScientificDepthControl() {
  const { selectedDepth } = useApp();
  const dispatch = useAppDispatch();
  const [exaggeration, setExaggeration] = useState(2.5);

  const handleDepthChange = (depth) => {
    dispatch({ type: 'SET_DEPTH', payload: Math.max(0, Math.min(5500, depth)) });
  };

  return (
    <div className="p-3.5 rounded-2xl bg-slate-950/95 border border-slate-700/60 shadow-[0_16px_48px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl text-slate-100 select-none flex flex-col gap-3 font-sans w-72 ring-1 ring-white/5">
      
      {/* 1. Header Bezel */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.12)] shrink-0">
            <Layers size={14} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-white uppercase tracking-wider leading-tight truncate">
              Vertical Depth Slice
            </div>
            <div className="text-[9px] text-cyan-400/80 font-mono tracking-tight mt-0.5">
              Z-AXIS INGESTION LAYER
            </div>
          </div>
        </div>

        {/* Digital Readout Pill */}
        <div className="flex items-center gap-1 font-mono text-cyan-300 text-xs font-bold bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800 shadow-inner shrink-0">
          <span>{selectedDepth ?? 0}</span>
          <span className="text-[10px] text-slate-400 font-sans font-normal">m</span>
        </div>
      </div>

      {/* 2. Depth Slider & Numeric Stepper */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="font-medium">Depth Level (0 – 5,000m)</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="5500"
              value={selectedDepth ?? 0}
              onChange={(e) => handleDepthChange(Number(e.target.value))}
              className="w-18 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-right font-mono text-xs font-bold text-cyan-300 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all"
            />
            <span className="text-slate-500 text-[10px] font-mono">m</span>
          </div>
        </div>
        
        <input
          type="range"
          min="0"
          max="5000"
          step="10"
          value={selectedDepth ?? 0}
          onChange={(e) => handleDepthChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-lg bg-slate-800 appearance-none cursor-pointer accent-cyan-400 border border-slate-700/50"
        />

        <div className="flex justify-between text-[9px] font-mono text-slate-500">
          <span>0m (Surface)</span>
          <span>2500m (Mesopelagic)</span>
          <span>5000m</span>
        </div>
      </div>

      {/* 3. Preset Depth Level Horizon Matrix (Symmetrical 5x2 Grid) */}
      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
          <span>Depth Horizons</span>
          <span className="text-[9px] text-slate-500">ISO-LEVELS</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {STANDARD_DEPTHS.map((item) => {
            const isSelected = selectedDepth === item.depth;
            return (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                key={item.depth}
                type="button"
                onClick={() => handleDepthChange(item.depth)}
                className={`relative py-1.5 px-0.5 rounded-lg text-[10px] font-mono transition-all duration-150 cursor-pointer text-center truncate ${
                  isSelected
                    ? 'bg-slate-850 text-cyan-300 font-bold border border-cyan-400/80 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                    : 'bg-slate-900/60 text-slate-400 hover:bg-slate-850 hover:text-slate-200 border border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="activeDepth"
                    className="absolute inset-0 rounded-lg ring-1 ring-cyan-400/50 pointer-events-none"
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 4. Vertical Exaggeration */}
      <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5 font-medium">
            <ArrowUpDown size={12} className="text-cyan-400" />
            Vertical Exaggeration
          </span>
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 font-mono font-semibold text-cyan-300 text-[10px]">
            {exaggeration}x
          </span>
        </div>
        <input
          type="range"
          min="1.0"
          max="10.0"
          step="0.5"
          value={exaggeration}
          onChange={(e) => setExaggeration(Number(e.target.value))}
          className="w-full h-1.5 rounded-lg bg-slate-800 appearance-none cursor-pointer accent-cyan-400 border border-slate-700/50"
        />
        <div className="flex justify-between text-[9px] font-mono text-slate-500">
          <span>1.0x (True)</span>
          <span>5.0x</span>
          <span>10.0x (Max)</span>
        </div>
      </div>
    </div>
  );
}
