import { useState } from 'react';
import { useApp, useAppDispatch } from '../../context/AppContext';

export default function HeatmapControls() {
  const [open, setOpen] = useState(false);
  const {
    showThermalHeatmap,
    showStreamlines,
    streamlineSpeed,
    heatmapOpacity,
  } = useApp();
  const dispatch = useAppDispatch();

  return (
    <div className="absolute top-16 left-16 z-50 flex flex-col gap-2">
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold backdrop-blur-md shadow-2xl transition-all cursor-pointer ${
          open
            ? 'bg-accent text-black border-accent font-bold ring-2 ring-accent/30'
            : 'bg-surface/90 border-border text-text hover:border-accent hover:text-accent'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span>🔥</span>
          <span>Ocean Layers</span>
        </span>
        <div className="flex gap-1">
          {showThermalHeatmap && (
            <span className="text-[0.62rem] font-mono px-1.5 py-0.5 rounded bg-rose/20 text-rose border border-rose/30">
              SST
            </span>
          )}
          {showStreamlines && (
            <span className="text-[0.62rem] font-mono px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
              FLOW
            </span>
          )}
        </div>
      </button>

      {/* Popover Controls Window */}
      {open && (
        <div className="w-80 bg-surface/95 border border-border-bright p-4 rounded-2xl backdrop-blur-md shadow-2xl flex flex-col gap-3.5 text-xs animate-fade-in">
          <div className="flex justify-between items-center border-b border-border pb-2 font-bold text-white">
            <span className="flex items-center gap-2 text-xs">
              <span>🌊</span> Ocean Thermal & Streamline Controls
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted hover:text-white cursor-pointer font-bold text-base"
            >
              &times;
            </button>
          </div>

          {/* Primary Layer Switches */}
          <div className="flex flex-col gap-2 bg-surface-3/60 p-2.5 rounded-xl border border-border">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <span>🔥</span> Sea Temperature (SST) Heatmap
              </span>
              <button
                onClick={() => dispatch({ type: 'TOGGLE_HEATMAP' })}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  showThermalHeatmap
                    ? 'bg-rose text-white shadow-md'
                    : 'bg-surface-2 text-muted border border-border hover:text-white'
                }`}
              >
                {showThermalHeatmap ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-border/40">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <span>🌀</span> Ocean Current Streamlines
              </span>
              <button
                onClick={() => dispatch({ type: 'TOGGLE_STREAMLINES' })}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  showStreamlines
                    ? 'bg-accent text-black shadow-md'
                    : 'bg-surface-2 text-muted border border-border hover:text-white'
                }`}
              >
                {showStreamlines ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Streamline Animation Speed */}
          {showStreamlines && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-muted text-[0.68rem] font-semibold">
                <span className="flex items-center gap-1">
                  <span>⚡</span> Current Flow Particle Speed
                </span>
                <span className="text-accent font-mono">{streamlineSpeed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.5"
                step="0.1"
                value={streamlineSpeed}
                onChange={(e) =>
                  dispatch({ type: 'SET_STREAMLINE_SPEED', payload: parseFloat(e.target.value) })
                }
                className="accent-accent w-full cursor-pointer h-1.5 bg-surface-3 rounded-lg appearance-none"
              />
            </div>
          )}

          {/* Thermal Layer Opacity */}
          {showThermalHeatmap && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-muted text-[0.68rem] font-semibold">
                <span className="flex items-center gap-1">
                  <span>☀️</span> Thermal Glow Opacity
                </span>
                <span className="text-accent font-mono">{Math.round(heatmapOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={heatmapOpacity}
                onChange={(e) =>
                  dispatch({ type: 'SET_HEATMAP_OPACITY', payload: parseFloat(e.target.value) })
                }
                className="accent-accent w-full cursor-pointer h-1.5 bg-surface-3 rounded-lg appearance-none"
              />
            </div>
          )}

          {/* Quick Basin Camera Presets */}
          <div className="border-t border-border/50 pt-2 flex flex-col gap-1">
            <span className="text-[0.65rem] text-muted uppercase font-semibold tracking-wider">
              Quick Focus Views
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => {
                  window.globeFocus?.('indian_southern');
                }}
                className="p-1.5 rounded-lg bg-surface-2 border border-border hover:border-accent hover:text-accent text-[0.68rem] font-medium transition-all"
              >
                🌊 Indo-Southern Gyre
              </button>
              <button
                onClick={() => {
                  window.globeFocus?.('bay_of_bengal');
                }}
                className="p-1.5 rounded-lg bg-surface-2 border border-border hover:border-accent hover:text-accent text-[0.68rem] font-medium transition-all"
              >
                🇮🇳 Bay of Bengal & Arabian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
