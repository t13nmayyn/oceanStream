import { motion } from 'framer-motion';
import { Sun, Moon, Eye, Anchor, Compass, ShieldAlert, Sparkles, ChevronDown, ArrowDown } from 'lucide-react';

const DEPTH_ZONES = [
  {
    id: 'sunlight',
    name: 'Sunlight Zone',
    scientificName: 'Epipelagic',
    range: '0 – 200 m',
    depthMin: 0,
    depthMax: 200,
    icon: Sun,
    color: '#38bdf8',
    bg: 'from-sky-500/20 to-blue-600/20',
    description: 'Home to 90% of all marine life and colorful coral reefs. Photosynthesis thrives here.',
    temperature: '22°C – 30°C',
    pressure: '1 – 20 atm',
    light: '100% – 1%',
  },
  {
    id: 'twilight',
    name: 'Twilight Zone',
    scientificName: 'Mesopelagic',
    range: '200 – 1,000 m',
    depthMin: 200,
    depthMax: 1000,
    icon: Eye,
    color: '#0ea5e9',
    bg: 'from-blue-600/20 to-indigo-700/20',
    description: 'Faint blue light fades away. Bioluminescent creatures sparkle in the darkness.',
    temperature: '4°C – 20°C',
    pressure: '20 – 100 atm',
    light: '< 1% (Dim glow)',
  },
  {
    id: 'midnight',
    name: 'Midnight Zone',
    scientificName: 'Bathypelagic',
    range: '1,000 – 4,000 m',
    depthMin: 1000,
    depthMax: 4000,
    icon: Moon,
    color: '#6366f1',
    bg: 'from-indigo-700/20 to-purple-900/20',
    description: 'Pitch black darkness. Creatures produce their own light (bioluminescence) to hunt and mate.',
    temperature: '1°C – 4°C',
    pressure: '100 – 400 atm',
    light: '0% (Total dark)',
  },
  {
    id: 'abyssal',
    name: 'Abyssal Zone',
    scientificName: 'Abyssopelagic',
    range: '4,000 – 6,000 m',
    depthMin: 4000,
    depthMax: 6000,
    icon: Anchor,
    color: '#a855f7',
    bg: 'from-purple-900/20 to-slate-950/40',
    description: 'Freezing temperatures and immense pressure. Giant hydrothermal vents support alien-like ecosystems.',
    temperature: '0°C – 2°C',
    pressure: '400 – 600 atm',
    light: '0% (Total dark)',
  },
  {
    id: 'hadal',
    name: 'Hadal Zone',
    scientificName: 'Trenches',
    range: '6,000 – 11,000 m',
    depthMin: 6000,
    depthMax: 11000,
    icon: ShieldAlert,
    color: '#f43f5e',
    bg: 'from-slate-950/60 to-black',
    description: 'Deep oceanic trenches like Mariana Trench. Extreme pressure, yet resilient amphipods survive.',
    temperature: '1°C – 4°C',
    pressure: '> 600 atm',
    light: '0% (Extreme abyss)',
  },
];

const DIVE_PRESETS = [
  { label: 'Surface (0m)', depth: 0, icon: '🏊' },
  { label: 'Sunlight (100m)', depth: 100, icon: '☀️' },
  { label: 'Twilight (500m)', depth: 500, icon: '🌌' },
  { label: 'Midnight (1000m)', depth: 1000, icon: '🌑' },
  { label: 'Abyss (4000m)', depth: 4000, icon: '❄️' },
];

export default function DepthJourney({ currentDepth, onDepthChange }) {
  // Current active zone
  const activeZone = DEPTH_ZONES.find(
    (z) => currentDepth >= z.depthMin && currentDepth < z.depthMax
  ) || DEPTH_ZONES[0];

  // Calculated physical metrics
  const calculatedPressure = (1 + currentDepth / 10).toFixed(0);
  const calculatedTemp = currentDepth < 100
    ? (28.5 - (currentDepth / 100) * 4).toFixed(1)
    : (4.0 + 20.0 * Math.exp(-currentDepth / 450)).toFixed(1);

  return (
    <div className="flex flex-col gap-3 w-80 max-h-[calc(100vh-140px)] overflow-y-auto p-4 rounded-2xl bg-slate-900/90 border border-slate-700/70 shadow-2xl backdrop-blur-xl text-slate-100 select-none">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Compass size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
              Ocean Depth Journey
            </h3>
            <span className="text-[11px] text-cyan-300 font-medium">
              Dive into the 5 Ocean Zones
            </span>
          </div>
        </div>
      </div>

      {/* Real-time Submersible HUD */}
      <div className="p-3.5 rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-950/90 border border-cyan-500/30 shadow-inner">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Submersible Depth</span>
          <span className="text-2xl font-extrabold text-cyan-300 font-mono tracking-tight drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
            {currentDepth.toLocaleString()} <span className="text-sm font-sans font-medium text-slate-400">m</span>
          </span>
        </div>

        {/* Depth Slider */}
        <div className="relative my-3">
          <input
            type="range"
            min="0"
            max="5000"
            step="25"
            value={currentDepth}
            onChange={(e) => onDepthChange(Number(e.target.value))}
            className="w-full h-2 rounded-lg bg-slate-700 appearance-none cursor-pointer accent-cyan-400 shadow-sm"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
            <span>0m (Surface)</span>
            <span>2,500m</span>
            <span>5,000m (Abyss)</span>
          </div>
        </div>

        {/* Telemetry Grid */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700/60 text-center">
          <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase">Pressure</div>
            <div className="text-xs font-bold text-amber-300 font-mono">{calculatedPressure} atm</div>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase">Temp</div>
            <div className="text-xs font-bold text-emerald-300 font-mono">{calculatedTemp}°C</div>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase">Sunlight</div>
            <div className="text-xs font-bold text-sky-300 font-mono">
              {currentDepth < 200 ? `${Math.max(1, (100 - (currentDepth / 2)).toFixed(0))}%` : '0%'}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Dive Presets */}
      <div>
        <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center gap-1.5">
          <ArrowDown size={13} className="text-cyan-400" />
          <span>Quick Dive Presets</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {DIVE_PRESETS.map((preset) => (
            <button
              key={preset.depth}
              onClick={() => onDepthChange(preset.depth)}
              className={`flex items-center gap-2 p-2 rounded-xl text-xs font-medium transition-all duration-150 border text-left cursor-pointer ${
                Math.abs(currentDepth - preset.depth) < 150
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              <span className="text-sm">{preset.icon}</span>
              <span className="truncate">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Vertical Zone Indicator Stack */}
      <div className="flex flex-col gap-2 pt-2">
        <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
          <Sparkles size={13} className="text-amber-400" />
          <span>Ocean Depth Zones</span>
        </div>

        <div className="space-y-2">
          {DEPTH_ZONES.map((zone) => {
            const Icon = zone.icon;
            const isCurrent = activeZone.id === zone.id;

            return (
              <motion.div
                key={zone.id}
                onClick={() => onDepthChange(zone.depthMin + (zone.id === 'sunlight' ? 50 : 250))}
                className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden ${
                  isCurrent
                    ? `bg-gradient-to-r ${zone.bg} border-cyan-400/80 shadow-lg`
                    : 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/70'
                }`}
                whileHover={{ scale: 1.01 }}
              >
                {/* Active glow bar on left */}
                {isCurrent && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />
                )}

                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="p-1.5 rounded-lg border"
                      style={{
                        backgroundColor: `${zone.color}20`,
                        borderColor: `${zone.color}50`,
                        color: zone.color,
                      }}
                    >
                      <Icon size={15} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        {zone.name}
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-cyan-500 text-slate-950">
                            YOU ARE HERE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {zone.range} · {zone.scientificName}
                      </div>
                    </div>
                  </div>
                </div>

                {isCurrent && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2.5 pt-2 border-t border-slate-700/60 text-[11px] text-slate-300 leading-relaxed"
                  >
                    {zone.description}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
