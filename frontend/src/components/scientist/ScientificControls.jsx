import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Thermometer, Droplets, Wind, Leaf, Activity, Droplet,
  Waves, BarChart2, Eye, Sliders, ChevronDown, ChevronRight,
  Database, Radio, Layers
} from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';

export const SCIENTIFIC_VARIABLES = [
  { id: 'temperature', code: 'thetao', label: 'Potential Temperature', unit: '°C', defaultMin: 18.0, defaultMax: 32.0, palette: 'coolwarm', group: 'Physics', icon: Thermometer, color: '#f87171' },
  { id: 'salinity', code: 'so', label: 'Practical Salinity', unit: 'PSU', defaultMin: 32.0, defaultMax: 36.5, palette: 'viridis', group: 'Physics', icon: Droplets, color: '#38bdf8' },
  { id: 'currents', code: 'uo,vo', label: 'Current Velocity (u, v)', unit: 'm/s', defaultMin: 0.0, defaultMax: 1.8, palette: 'turbo', group: 'Physics', icon: Wind, color: '#818cf8' },
  { id: 'zos', code: 'zos', label: 'Sea Surface Height', unit: 'm', defaultMin: -1.2, defaultMax: 1.2, palette: 'coolwarm', group: 'Physics', icon: Waves, color: '#60a5fa' },
  { id: 'chlorophyll', code: 'chl', label: 'Chlorophyll-a Mass', unit: 'mg/m³', defaultMin: 0.01, defaultMax: 4.5, palette: 'emerald', group: 'Biogeochemistry', icon: Leaf, color: '#34d399' },
  { id: 'oxygen', code: 'o2', label: 'Dissolved Oxygen', unit: 'mmol/m³', defaultMin: 50.0, defaultMax: 260.0, palette: 'hypoxia', group: 'Biogeochemistry', icon: Activity, color: '#22d3ee' },
  { id: 'nitrate', code: 'no3', label: 'Nitrate Concentration', unit: 'mmol/m³', defaultMin: 0.1, defaultMax: 35.0, palette: 'plasma', group: 'Biogeochemistry', icon: Droplet, color: '#fbbf24' },
  { id: 'ph', code: 'ph', label: 'Ocean pH', unit: 'pH', defaultMin: 7.7, defaultMax: 8.3, palette: 'viridis', group: 'Biogeochemistry', icon: Sliders, color: '#a78bfa' },
  { id: 'pco2', code: 'spco2', label: 'Surface pCO2', unit: 'μatm', defaultMin: 320.0, defaultMax: 480.0, palette: 'coolwarm', group: 'Biogeochemistry', icon: BarChart2, color: '#f472b6' },
];

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

  return (
    <div className="w-84 max-h-[calc(100vh-140px)] overflow-y-auto p-4 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl text-slate-100 select-none flex flex-col gap-3 font-sans">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30">
            <Sliders size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Scientific Workbench
            </h3>
            <span className="text-[10px] text-violet-300 font-mono">
              Copernicus + Argo Ingest
            </span>
          </div>
        </div>
      </div>

      {/* Control Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] font-semibold">
        <button
          onClick={() => setActiveTab('variables')}
          className={`py-1.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'variables'
              ? 'bg-violet-600/40 text-violet-200 border border-violet-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Variables
        </button>
        <button
          onClick={() => setActiveTab('layers')}
          className={`py-1.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'layers'
              ? 'bg-violet-600/40 text-violet-200 border border-violet-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Layers
        </button>
        <button
          onClick={() => setActiveTab('engine')}
          className={`py-1.5 rounded-lg transition-all cursor-pointer ${
            activeTab === 'engine'
              ? 'bg-violet-600/40 text-violet-200 border border-violet-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Engine
        </button>
      </div>

      {/* Tab 1: Variables */}
      {activeTab === 'variables' && (
        <div className="space-y-3">
          {/* Physics Group */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
              <Database size={12} className="text-cyan-400" />
              <span>Ocean Physics (ANFC_PHY)</span>
            </div>
            <div className="space-y-1">
              {physicsVars.map((v) => {
                const isSelected = selectedVariable === v.id;
                const Icon = v.icon;
                return (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVar(v)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-violet-900/40 to-slate-800/80 border-violet-500 text-white shadow-md'
                        : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:bg-slate-800/80 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="p-1 rounded-lg"
                        style={{ backgroundColor: `${v.color}20`, color: v.color }}
                      >
                        <Icon size={14} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold">{v.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {v.code} · {v.unit}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_#7b5af5]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Biogeochemistry Group */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
              <Leaf size={12} className="text-emerald-400" />
              <span>Biogeochemistry (ANFC_BGC)</span>
            </div>
            <div className="space-y-1">
              {bgcVars.map((v) => {
                const isSelected = selectedVariable === v.id;
                const Icon = v.icon;
                return (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVar(v)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-emerald-900/40 to-slate-800/80 border-emerald-500 text-white shadow-md'
                        : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:bg-slate-800/80 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="p-1 rounded-lg"
                        style={{ backgroundColor: `${v.color}20`, color: v.color }}
                      >
                        <Icon size={14} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold">{v.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {v.code} · {v.unit}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Layers & Observations */}
      {activeTab === 'layers' && (
        <div className="space-y-3 text-xs">
          {/* Thermal Raster */}
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Layers size={14} className="text-cyan-400" />
                Raster Heatmap Field
              </span>
              <input
                type="checkbox"
                checked={showThermalHeatmap}
                onChange={(e) => dispatch({ type: 'TOGGLE_HEATMAP', payload: e.target.checked })}
                className="rounded accent-cyan-500 w-4 h-4 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Interpolated 2D continuous ocean scalar surface texture.
            </p>
          </div>

          {/* Current Vectors & Streamlines */}
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Wind size={14} className="text-indigo-400" />
                Vector Current Streamlines
              </span>
              <input
                type="checkbox"
                checked={showStreamlines}
                onChange={(e) => dispatch({ type: 'TOGGLE_STREAMLINES', payload: e.target.checked })}
                className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
              />
            </div>
            {showStreamlines && (
              <div className="space-y-1 pt-1 border-t border-slate-700">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Particle Flow Speed</span>
                  <span className="font-mono text-indigo-300">{streamlineSpeed}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.25"
                  value={streamlineSpeed}
                  onChange={(e) => dispatch({ type: 'SET_STREAMLINE_SPEED', payload: Number(e.target.value) })}
                  className="w-full h-1.5 rounded-lg bg-slate-700 appearance-none cursor-pointer accent-indigo-400"
                />
              </div>
            )}
          </div>

          {/* Argo Float Observation Layer */}
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Radio size={14} className="text-emerald-400" />
                Argo Float Layer
              </span>
              <input
                type="checkbox"
                checked={showArgoLayer}
                onChange={(e) => dispatch({ type: 'TOGGLE_ARGO_LAYER', payload: e.target.checked })}
                className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
              />
            </div>
            {showArgoLayer && (
              <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-700">
                {['both', 'core', 'bgc'].map((type) => (
                  <button
                    key={type}
                    onClick={() => dispatch({ type: 'SET_ARGO_FILTER', payload: type })}
                    className={`py-1 rounded-lg text-[10px] font-mono uppercase transition-all cursor-pointer ${
                      argoFilter === type
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Engine & Basemap */}
      {activeTab === 'engine' && (
        <div className="space-y-3 text-xs">
          <div>
            <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
              Projection Engine
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => dispatch({ type: 'SET_ENGINE_MODE', payload: '3d' })}
                className={`py-2 rounded-xl text-center border font-semibold transition-all cursor-pointer ${
                  engineMode === '3d'
                    ? 'bg-cyan-600/40 border-cyan-500 text-cyan-200'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                3D Cesium Globe
              </button>
              <button
                onClick={() => dispatch({ type: 'SET_ENGINE_MODE', payload: '2d' })}
                className={`py-2 rounded-xl text-center border font-semibold transition-all cursor-pointer ${
                  engineMode === '2d'
                    ? 'bg-cyan-600/40 border-cyan-500 text-cyan-200'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                2D Leaflet Flat
              </button>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
              Basemap Imagery
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {['satellite', 'ocean', 'dark', 'osm'].map((bm) => (
                <button
                  key={bm}
                  onClick={() => dispatch({ type: 'SET_BASEMAP', payload: bm })}
                  className={`py-2 px-2.5 rounded-xl text-center border text-xs font-semibold capitalize transition-all cursor-pointer ${
                    basemap === bm
                      ? 'bg-cyan-600/40 border-cyan-500 text-cyan-200'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {bm}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
