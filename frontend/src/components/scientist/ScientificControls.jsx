import { useState } from 'react';
import {
  Thermometer, Droplets, Wind, Leaf, Activity, Droplet,
  Waves, BarChart2, Sliders, Database, Radio, Layers,
  Globe, Map, Check, SlidersHorizontal
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp, useAppDispatch } from '../../context/AppContext';

export const SCIENTIFIC_VARIABLES = [
  { id: 'temperature', code: 'thetao', label: 'Potential Temperature', unit: '°C', symbol: 'θ', defaultMin: 18.0, defaultMax: 32.0, palette: 'coolwarm', group: 'Physics', icon: Thermometer, color: '#f87171' },
  { id: 'salinity', code: 'so', label: 'Practical Salinity', unit: 'PSU', symbol: 'S', defaultMin: 32.0, defaultMax: 36.5, palette: 'viridis', group: 'Physics', icon: Droplets, color: '#38bdf8' },
  { id: 'currents', code: 'uo,vo', label: 'Current Velocity', unit: 'm/s', symbol: 'u,v', defaultMin: 0.0, defaultMax: 1.8, palette: 'turbo', group: 'Physics', icon: Wind, color: '#818cf8' },
  { id: 'zos', code: 'zos', label: 'Sea Surface Height', unit: 'm', symbol: 'η', defaultMin: -1.2, defaultMax: 1.2, palette: 'coolwarm', group: 'Physics', icon: Waves, color: '#60a5fa' },
  { id: 'chlorophyll', code: 'chl', label: 'Chlorophyll-a Mass', unit: 'mg/m³', symbol: 'Chl-a', defaultMin: 0.01, defaultMax: 4.5, palette: 'emerald', group: 'Biogeochemistry', icon: Leaf, color: '#34d399' },
  { id: 'oxygen', code: 'o2', label: 'Dissolved Oxygen', unit: 'mmol/m³', symbol: 'O₂', defaultMin: 50.0, defaultMax: 260.0, palette: 'hypoxia', group: 'Biogeochemistry', icon: Activity, color: '#22d3ee' },
  { id: 'nitrate', code: 'no3', label: 'Nitrate Concentration', unit: 'mmol/m³', symbol: 'NO₃⁻', defaultMin: 0.1, defaultMax: 35.0, palette: 'plasma', group: 'Biogeochemistry', icon: Droplet, color: '#fbbf24' },
  { id: 'ph', code: 'ph', label: 'Ocean pH', unit: 'pH', symbol: 'pH', defaultMin: 7.7, defaultMax: 8.3, palette: 'viridis', group: 'Biogeochemistry', icon: Sliders, color: '#a78bfa' },
  { id: 'pco2', code: 'spco2', label: 'Surface pCO2', unit: 'μatm', symbol: 'pCO₂', defaultMin: 320.0, defaultMax: 480.0, palette: 'coolwarm', group: 'Biogeochemistry', icon: BarChart2, color: '#f472b6' },
];

const ARGO_FILTERS = [
  { id: 'both', label: 'All Floats' },
  { id: 'core', label: 'Core CTD' },
  { id: 'bgc', label: 'BGC Sensors' },
];

const ENGINE_OPTIONS = [
  { id: '3d', label: '3D Cesium Globe', sub: 'WGS84 True Ellipsoid', icon: Globe },
  { id: '2d', label: '2D Leaflet Flat', sub: 'EPSG:3857 Planar', icon: Map },
];

const BASEMAP_OPTIONS = [
  { id: 'satellite', label: 'Satellite', sub: 'Blue Marble HD' },
  { id: 'ocean', label: 'Ocean Relief', sub: 'GEBCO Bathy' },
  { id: 'dark', label: 'Dark Matter', sub: 'CartoDB Night' },
  { id: 'osm', label: 'Street Map', sub: 'Vector Basemap' },
];

function InstrumentToggle({ checked, onChange, activeGlow = 'bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.45)]' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`w-9 h-5 rounded-full p-0.5 transition-all duration-200 cursor-pointer flex items-center relative shrink-0 ${
        checked ? activeGlow : 'bg-slate-800 border border-slate-700/80 hover:border-slate-600'
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0 bg-slate-300'
        }`}
      />
    </button>
  );
}

export default function ScientificControls({ onVariableSelect }) {
  const {
    selectedVariable,
    showThermalHeatmap,
    showStreamlines,
    showArgoLayer,
    argoFilter,
    streamlineSpeed,
    engineMode,
    basemap,
  } = useApp();

  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState('variables'); // 'variables' | 'layers' | 'engine'

  const handleSelectVar = (variable) => {
    dispatch({ type: 'SET_SELECTED_VARIABLE', payload: variable.id });
    dispatch({ type: 'SET_COLOR_PALETTE', payload: variable.palette });
    dispatch({ type: 'SET_COLOR_RANGE', payload: { min: variable.defaultMin, max: variable.defaultMax } });
    onVariableSelect?.(variable);
  };

  const physicsVars = SCIENTIFIC_VARIABLES.filter((v) => v.group === 'Physics');
  const bgcVars = SCIENTIFIC_VARIABLES.filter((v) => v.group === 'Biogeochemistry');

  const activeLayersCount = (showThermalHeatmap ? 1 : 0) + (showStreamlines ? 1 : 0) + (showArgoLayer ? 1 : 0);

  return (
    <div className="w-[340px] max-h-[calc(100vh-140px)] rounded-2xl bg-slate-950/95 border border-slate-700/60 shadow-[0_16px_48px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl text-slate-100 select-none flex flex-col font-sans ring-1 ring-white/5 overflow-hidden">
      
      {/* 1. Header Bezel */}
      <div className="px-3.5 py-3 border-b border-slate-800/80 bg-slate-900/40 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.12)]">
            <SlidersHorizontal size={14} />
          </div>
          <div>
            <h3 className="text-[11px] font-bold text-white uppercase tracking-wider leading-tight">
              Scientific Workbench
            </h3>
            <div className="text-[9px] text-cyan-400/80 font-mono tracking-tight flex items-center gap-1.5 mt-0.5">
              <span>COPERNICUS · ARGO INGEST</span>
            </div>
          </div>
        </div>

        {/* Telemetry Status Pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900/90 border border-slate-800 shadow-inner">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-[9px] font-mono font-semibold tracking-wider uppercase text-slate-300">
            L4 4D
          </span>
        </div>
      </div>

      {/* 2. Precision Segmented Tab Controller */}
      <div className="px-3.5 pt-2.5 pb-2 shrink-0">
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/90 rounded-xl border border-slate-800/90 shadow-inner text-[11px]">
          <button
            type="button"
            onClick={() => setActiveTab('variables')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'variables'
                ? 'bg-slate-800/90 text-cyan-300 font-semibold border border-cyan-500/30 shadow-[0_2px_8px_rgba(6,182,212,0.15)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Sliders size={12} className={activeTab === 'variables' ? 'text-cyan-400' : 'text-slate-400'} />
            <span>Variables</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('layers')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'layers'
                ? 'bg-slate-800/90 text-cyan-300 font-semibold border border-cyan-500/30 shadow-[0_2px_8px_rgba(6,182,212,0.15)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Layers size={12} className={activeTab === 'layers' ? 'text-cyan-400' : 'text-slate-400'} />
            <span>Layers</span>
            {activeLayersCount > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('engine')}
            className={`py-1.5 px-2 rounded-lg font-medium transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'engine'
                ? 'bg-slate-800/90 text-cyan-300 font-semibold border border-cyan-500/30 shadow-[0_2px_8px_rgba(6,182,212,0.15)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <Globe size={12} className={activeTab === 'engine' ? 'text-cyan-400' : 'text-slate-400'} />
            <span>Engine</span>
            <span className="text-[9px] font-mono uppercase text-slate-400">
              {engineMode}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Scrollable Tab Body */}
      <div
        className="px-3.5 pb-3.5 pt-1 overflow-y-auto min-h-0 flex-1 space-y-3"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
      >
        <AnimatePresence mode="wait">
          {/* TAB 1: VARIABLES */}
          {activeTab === 'variables' && (
            <motion.div
              key="variables"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
            {/* Ocean Physics Group */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800/70">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Database size={12} className="text-cyan-400" />
                  <span className="font-semibold text-slate-300">Ocean Physics</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-cyan-400/90">ANFC_PHY</span>
                </div>
                <span className="text-[9px] font-mono text-slate-400">
                  {physicsVars.length} CHANNELS
                </span>
              </div>

              <div className="space-y-1.5">
                {physicsVars.map((v) => {
                  const isSelected = selectedVariable === v.id;
                  const Icon = v.icon;
                  return (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVar(v)}
                      className={`group relative w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer overflow-hidden ${
                        isSelected
                          ? 'bg-slate-850/90 border-cyan-500/70 shadow-[0_0_16px_rgba(6,182,212,0.12)] ring-1 ring-cyan-500/30'
                          : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-850/70 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      {/* Left Accent Bar */}
                      {isSelected && (
                        <motion.div
                          layoutId="activePhysicsVar"
                          className="absolute left-0 top-0 bottom-0 w-1 rounded-r"
                          style={{ backgroundColor: v.color }}
                        />
                      )}

                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="p-1.5 rounded-lg shrink-0 border border-white/5 transition-colors"
                          style={{
                            backgroundColor: `${v.color}18`,
                            color: v.color,
                            borderColor: isSelected ? `${v.color}50` : 'rgba(255,255,255,0.06)'
                          }}
                        >
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                              {v.label}
                            </span>
                            {v.symbol && (
                              <span className="text-[10px] font-mono text-slate-400 font-medium shrink-0">
                                ({v.symbol})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono mt-0.5">
                            <span className={isSelected ? 'text-cyan-300 font-medium' : 'text-slate-400'}>
                              {v.code}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className={isSelected ? 'text-cyan-300 font-medium' : 'text-slate-400'}>
                              {v.unit}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isSelected ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1 shadow-[0_0_8px_rgba(6,182,212,0.25)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            ACT
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[9px] font-mono text-slate-400 group-hover:text-slate-300 group-hover:border-slate-700 transition-colors">
                            {v.defaultMin}..{v.defaultMax}
                          </span>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Biogeochemistry Group */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800/70">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Leaf size={12} className="text-emerald-400" />
                  <span className="font-semibold text-slate-300">Biogeochemistry</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-emerald-400/90">ANFC_BGC</span>
                </div>
                <span className="text-[9px] font-mono text-slate-400">
                  {bgcVars.length} CHANNELS
                </span>
              </div>

              <div className="space-y-1.5">
                {bgcVars.map((v) => {
                  const isSelected = selectedVariable === v.id;
                  const Icon = v.icon;
                  return (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVar(v)}
                      className={`group relative w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer overflow-hidden ${
                        isSelected
                          ? 'bg-slate-850/90 border-emerald-500/70 shadow-[0_0_16px_rgba(16,185,129,0.12)] ring-1 ring-emerald-500/30'
                          : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-850/70 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      {/* Left Accent Bar */}
                      {isSelected && (
                        <motion.div
                          layoutId="activeBgcVar"
                          className="absolute left-0 top-0 bottom-0 w-1 rounded-r"
                          style={{ backgroundColor: v.color }}
                        />
                      )}

                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="p-1.5 rounded-lg shrink-0 border border-white/5 transition-colors"
                          style={{
                            backgroundColor: `${v.color}18`,
                            color: v.color,
                            borderColor: isSelected ? `${v.color}50` : 'rgba(255,255,255,0.06)'
                          }}
                        >
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'}`}>
                              {v.label}
                            </span>
                            {v.symbol && (
                              <span className="text-[10px] font-mono text-slate-400 font-medium shrink-0">
                                ({v.symbol})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono mt-0.5">
                            <span className={isSelected ? 'text-emerald-300 font-medium' : 'text-slate-400'}>
                              {v.code}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className={isSelected ? 'text-emerald-300 font-medium' : 'text-slate-400'}>
                              {v.unit}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isSelected ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-[0_0_8px_rgba(16,185,129,0.25)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            ACT
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[9px] font-mono text-slate-400 group-hover:text-slate-300 group-hover:border-slate-700 transition-colors">
                            {v.defaultMin}..{v.defaultMax}
                          </span>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 2: LAYERS & OBSERVATIONS */}
        {activeTab === 'layers' && (
          <motion.div
            key="layers"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-2.5 text-xs"
          >
            {/* Layer 1: Continuous Heatmap Field */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Layers size={14} />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-xs">
                      Raster Heatmap Field
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      2D continuous scalar surface mesh
                    </div>
                  </div>
                </div>
                <InstrumentToggle
                  checked={showThermalHeatmap}
                  onChange={() => dispatch({ type: 'TOGGLE_HEATMAP', payload: !showThermalHeatmap })}
                  activeGlow="bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.45)]"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                Interpolated continuous field texture with custom colormaps and dynamic threshold slicing.
              </p>
            </div>

            {/* Layer 2: Vector Streamlines */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Wind size={14} />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-xs">
                      Current Streamlines
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Lagrangian velocity particles (uo, vo)
                    </div>
                  </div>
                </div>
                <InstrumentToggle
                  checked={showStreamlines}
                  onChange={() => dispatch({ type: 'TOGGLE_STREAMLINES', payload: !showStreamlines })}
                  activeGlow="bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.45)]"
                />
              </div>

              {showStreamlines && (
                <div className="space-y-2 pt-2.5 mt-2 border-t border-slate-800/90">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-medium">Particle Flow Velocity</span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 font-mono font-semibold text-indigo-300 text-[10px]">
                      {Number(streamlineSpeed).toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.25"
                    value={streamlineSpeed}
                    onChange={(e) => dispatch({ type: 'SET_STREAMLINE_SPEED', payload: Number(e.target.value) })}
                    className="w-full h-1.5 rounded-lg bg-slate-800 appearance-none cursor-pointer accent-indigo-400 border border-slate-700/50"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-slate-400">
                    <span>0.5x (Slow)</span>
                    <span>1.75x (Nominal)</span>
                    <span>3.0x (Fast)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Layer 3: Argo Floats */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Radio size={14} />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-xs">
                      Argo Profiling Floats
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      In-situ autonomous telemetry points
                    </div>
                  </div>
                </div>
                <InstrumentToggle
                  checked={showArgoLayer}
                  onChange={() => dispatch({ type: 'TOGGLE_ARGO_LAYER', payload: !showArgoLayer })}
                  activeGlow="bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.45)]"
                />
              </div>

              {showArgoLayer && (
                <div className="space-y-2 pt-2.5 mt-2 border-t border-slate-800/90">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-medium">Telemetry Sub-Filter</span>
                    <span className="text-[9px] font-mono text-emerald-400/80">IN-SITU PROFILES</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-950/80 rounded-xl border border-slate-800/80">
                    {ARGO_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => dispatch({ type: 'SET_ARGO_FILTER', payload: f.id })}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-mono uppercase transition-all duration-150 cursor-pointer text-center ${
                          argoFilter === f.id
                            ? 'bg-emerald-600/30 text-emerald-200 font-bold border border-emerald-500/50 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 3: ENGINE & BASEMAP */}
        {activeTab === 'engine' && (
          <motion.div
            key="engine"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-3.5 text-xs"
          >
            {/* Projection Engine Selector */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Globe size={11} className="text-cyan-400" />
                  Projection Engine
                </span>
                <span className="text-[9px] text-slate-400">COORDINATE REF</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ENGINE_OPTIONS.map((opt) => {
                  const isSelected = engineMode === opt.id;
                  const Icon = opt.icon;
                  return (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      key={opt.id}
                      type="button"
                      onClick={() => dispatch({ type: 'SET_ENGINE_MODE', payload: opt.id })}
                      className={`p-2.5 rounded-xl text-left border transition-all duration-150 cursor-pointer flex flex-col gap-1 relative overflow-hidden ${
                        isSelected
                          ? 'bg-slate-850/90 border-cyan-500/70 text-white shadow-[0_0_16px_rgba(6,182,212,0.12)] ring-1 ring-cyan-500/30'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-850/60 hover:border-slate-700'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                        </div>
                      )}
                      <div className={`p-1.5 rounded-lg w-fit ${isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800/80 text-slate-400'}`}>
                        <Icon size={14} />
                      </div>
                      <div className="text-xs font-semibold mt-0.5">{opt.label}</div>
                      <div className="text-[10px] font-mono text-slate-400">{opt.sub}</div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Basemap Selector */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Map size={11} className="text-cyan-400" />
                  Basemap Imagery
                </span>
                <span className="text-[9px] text-slate-400">TILE LAYER</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BASEMAP_OPTIONS.map((bm) => {
                  const isSelected = basemap === bm.id;
                  return (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      key={bm.id}
                      type="button"
                      onClick={() => dispatch({ type: 'SET_BASEMAP', payload: bm.id })}
                      className={`p-2.5 rounded-xl text-left border transition-all duration-150 cursor-pointer flex flex-col gap-0.5 relative overflow-hidden ${
                        isSelected
                          ? 'bg-slate-850/90 border-cyan-500/70 text-white shadow-[0_0_14px_rgba(6,182,212,0.12)] ring-1 ring-cyan-500/30'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-850/60 hover:border-slate-700'
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute top-2 right-2 text-cyan-400">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                      <div className="text-xs font-semibold">{bm.label}</div>
                      <div className="text-[10px] font-mono text-slate-400">{bm.sub}</div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}
