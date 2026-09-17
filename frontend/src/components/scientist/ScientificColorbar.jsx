import { useState } from 'react';
import { Palette, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp, useAppDispatch } from '../../context/AppContext';
import { SCIENTIFIC_VARIABLES } from './ScientificControls';

const PALETTES = [
  { id: 'coolwarm', label: 'Coolwarm', gradient: 'linear-gradient(to right, #0044ff, #00d4ff, #ffffff, #ffaa00, #ff0000)' },
  { id: 'viridis',  label: 'Viridis',  gradient: 'linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)' },
  { id: 'turbo',    label: 'Turbo',    gradient: 'linear-gradient(to right, #30123b, #1ae4b6, #a2fc3c, #fb8022, #7a0403)' },
  { id: 'emerald',  label: 'Emerald',  gradient: 'linear-gradient(to right, #f7fcf5, #c7e9c0, #74c476, #238b45, #00441b)' },
  { id: 'hypoxia',  label: 'Hypoxia',  gradient: 'linear-gradient(to right, #e11d48, #fbbf24, #22d3ee, #0284c7, #1e3a8a)' },
  { id: 'plasma',   label: 'Plasma',   gradient: 'linear-gradient(to right, #0d0887, #6a00a8, #b12a90, #e16462, #fca636)' },
];

export default function ScientificColorbar() {
  const {
    selectedVariable,
    colorPalette,
    colorMin,
    colorMax,
    heatmapOpacity,
  } = useApp();

  const dispatch = useAppDispatch();
  const [isLog, setIsLog] = useState(false);

  const currentVar = SCIENTIFIC_VARIABLES.find((v) => v.id === selectedVariable) || SCIENTIFIC_VARIABLES[0];
  const activePalette = PALETTES.find((p) => p.id === colorPalette) || PALETTES[0];

  const handleMinChange = (min) => {
    dispatch({ type: 'SET_COLOR_RANGE', payload: { min, max: colorMax } });
  };

  const handleMaxChange = (max) => {
    dispatch({ type: 'SET_COLOR_RANGE', payload: { min: colorMin, max } });
  };

  return (
    <div className="p-3.5 rounded-2xl bg-slate-950/95 border border-slate-700/60 shadow-[0_16px_48px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl text-slate-100 select-none flex flex-col gap-3 font-sans w-72 ring-1 ring-white/5">
      
      {/* 1. Header Bezel */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.12)] shrink-0">
            <Palette size={14} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-white uppercase tracking-wider leading-tight truncate">
              Scientific Colormap
            </div>
            <div className="text-[9px] text-cyan-400/80 font-mono tracking-tight mt-0.5 truncate">
              {currentVar.label} ({currentVar.unit})
            </div>
          </div>
        </div>

        {/* Lin / Log Scale Mode Button */}
        <button
          type="button"
          onClick={() => setIsLog(!isLog)}
          className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all duration-150 cursor-pointer border ${
            isLog
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold shadow-[0_0_8px_rgba(245,158,11,0.25)]'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
          title="Toggle Linear / Logarithmic Colormap Scale"
        >
          {isLog ? 'LOG' : 'LIN'}
        </button>
      </div>

      {/* 2. Visual Gradient Legend Strip */}
      <div className="space-y-1.5">
        <div className="relative">
          <div
            className="w-full h-4 rounded-lg shadow-inner border border-slate-700/80"
            style={{ background: activePalette.gradient }}
          />
          {/* Ticks */}
          <div className="flex justify-between px-1 pt-0.5 text-[8px] font-mono text-slate-500">
            <span>|</span>
            <span>|</span>
            <span>|</span>
            <span>|</span>
            <span>|</span>
          </div>
        </div>

        {/* Min / Unit / Max Readouts */}
        <div className="flex justify-between items-center text-[10px] font-mono text-slate-300">
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-slate-500 font-mono">MIN</span>
            <input
              type="number"
              value={colorMin}
              step="0.5"
              onChange={(e) => handleMinChange(Number(e.target.value))}
              className="w-14 px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-left text-cyan-300 font-bold focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all"
            />
          </div>

          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-semibold text-[10px]">
            {currentVar.unit}
          </span>

          <div className="flex items-center gap-1">
            <input
              type="number"
              value={colorMax}
              step="0.5"
              onChange={(e) => handleMaxChange(Number(e.target.value))}
              className="w-14 px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-right text-rose-400 font-bold focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400/30 transition-all"
            />
            <span className="text-[8px] text-slate-500 font-mono">MAX</span>
          </div>
        </div>
      </div>

      {/* 3. Colormap Preset Swatches (3x2 Grid with actual gradient bars) */}
      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
          <span>Colormap Preset</span>
          <span className="text-[9px] text-slate-500">COLOR SCHEMES</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {PALETTES.map((p) => {
            const isSelected = colorPalette === p.id;
            return (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                key={p.id}
                type="button"
                onClick={() => dispatch({ type: 'SET_COLOR_PALETTE', payload: p.id })}
                className={`relative p-1.5 rounded-lg flex flex-col gap-1 border transition-all duration-150 cursor-pointer overflow-hidden text-left ${
                  isSelected
                    ? 'bg-slate-850 border-cyan-400/80 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:bg-slate-850 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="activeColormap"
                    className="absolute inset-0 rounded-lg ring-1 ring-cyan-400/50 pointer-events-none"
                  />
                )}
                {/* Visual Palette Mini Swatch */}
                <div
                  className="relative z-10 w-full h-1.5 rounded-sm"
                  style={{ background: p.gradient }}
                />
                <div className="flex items-center justify-between text-[10px] font-semibold truncate leading-none">
                  <span className="truncate">{p.label}</span>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 4. Layer Opacity */}
      <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5 font-medium">
            <Eye size={12} className="text-cyan-400" />
            Layer Opacity
          </span>
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 font-mono font-semibold text-cyan-300 text-[10px]">
            {Math.round(heatmapOpacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={heatmapOpacity}
          onChange={(e) => dispatch({ type: 'SET_HEATMAP_OPACITY', payload: Number(e.target.value) })}
          className="w-full h-1.5 rounded-lg bg-slate-800 appearance-none cursor-pointer accent-cyan-400 border border-slate-700/50"
        />
      </div>
    </div>
  );
}
