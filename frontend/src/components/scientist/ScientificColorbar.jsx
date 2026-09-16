import { useState } from 'react';
import { Palette, Eye, Sliders, ChevronDown } from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';
import { SCIENTIFIC_VARIABLES } from './ScientificControls';

const PALETTES = [
  { id: 'coolwarm', label: 'Coolwarm', gradient: 'linear-gradient(to right, #0044ff, #00d4ff, #ffffff, #ffaa00, #ff0000)' },
  { id: 'viridis',  label: 'Viridis',  gradient: 'linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)' },
  { id: 'turbo',    label: 'Turbo',    gradient: 'linear-gradient(to right, #30123b, #1ae4b6, #a2fc3c, #fb8022, #7a0403)' },
  { id: 'emerald',  label: 'Emerald (Chl)', gradient: 'linear-gradient(to right, #f7fcf5, #c7e9c0, #74c476, #238b45, #00441b)' },
  { id: 'hypoxia',  label: 'Hypoxia (O2)',  gradient: 'linear-gradient(to right, #e11d48, #fbbf24, #22d3ee, #0284c7, #1e3a8a)' },
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
    <div className="p-3.5 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl text-slate-100 select-none flex flex-col gap-2.5 font-sans w-72">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Palette size={14} />
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider">
              Scientific Colormap
            </div>
            <div className="text-[10px] text-emerald-300 font-mono">
              {currentVar.label} ({currentVar.unit})
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsLog(!isLog)}
          className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
            isLog
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          {isLog ? 'LOG' : 'LIN'}
        </button>
      </div>

      {/* Visual Gradient Bar */}
      <div className="space-y-1">
        <div
          className="w-full h-4 rounded-lg shadow-inner border border-slate-700/80"
          style={{ background: activePalette.gradient }}
        />
        <div className="flex justify-between items-center text-[10px] font-mono text-slate-300">
          <input
            type="number"
            value={colorMin}
            step="0.5"
            onChange={(e) => handleMinChange(Number(e.target.value))}
            className="w-14 px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-left text-cyan-300 font-bold"
          />
          <span className="text-slate-500 font-sans">{currentVar.unit}</span>
          <input
            type="number"
            value={colorMax}
            step="0.5"
            onChange={(e) => handleMaxChange(Number(e.target.value))}
            className="w-14 px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-right text-red-400 font-bold"
          />
        </div>
      </div>

      {/* Palette Selector */}
      <div>
        <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
          Colormap Preset
        </div>
        <div className="grid grid-cols-3 gap-1">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => dispatch({ type: 'SET_COLOR_PALETTE', payload: p.id })}
              className={`p-1.5 rounded-lg text-[10px] font-semibold text-center truncate border transition-all cursor-pointer ${
                colorPalette === p.id
                  ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200 shadow-sm'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Opacity Slider */}
      <div className="pt-2 border-t border-slate-800/80 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <Eye size={11} className="text-cyan-400" />
            Layer Opacity
          </span>
          <span className="font-mono text-cyan-300">{(heatmapOpacity * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={heatmapOpacity}
          onChange={(e) => dispatch({ type: 'SET_HEATMAP_OPACITY', payload: Number(e.target.value) })}
          className="w-full h-1.5 rounded-lg bg-slate-700 appearance-none cursor-pointer accent-cyan-400"
        />
      </div>
    </div>
  );
}
