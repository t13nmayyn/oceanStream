import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun,
  Moon,
  Eye,
  Anchor,
  Compass,
  ShieldAlert,
  Sparkles,
  ArrowDown,
  Gauge,
  Thermometer,
  Waves,
} from 'lucide-react';

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
    bg: 'from-sky-400/10 via-cyan-400/5 to-transparent',
    description:
      'Home to 90% of all marine life and colorful coral reefs. Photosynthesis thrives here.',
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
    bg: 'from-blue-500/10 via-indigo-500/5 to-transparent',
    description:
      'Faint blue light fades away. Bioluminescent creatures sparkle in the darkness.',
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
    color: '#818cf8',
    bg: 'from-indigo-500/10 via-violet-500/5 to-transparent',
    description:
      'Pitch black darkness. Creatures produce their own light to hunt and mate.',
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
    bg: 'from-violet-500/10 via-purple-500/5 to-transparent',
    description:
      'Freezing temperatures and immense pressure. Hydrothermal vents support unique ecosystems.',
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
    color: '#fb7185',
    bg: 'from-rose-500/10 via-slate-950/20 to-transparent',
    description:
      'Deep oceanic trenches like the Mariana Trench. Extreme pressure, yet life persists.',
    temperature: '1°C – 4°C',
    pressure: '> 600 atm',
    light: '0% (Extreme abyss)',
  },
];

const DIVE_PRESETS = [
  { label: 'Surface', depth: 0, icon: '🏊', sub: '0 m' },
  { label: 'Sunlight', depth: 100, icon: '☀️', sub: '100 m' },
  { label: 'Twilight', depth: 500, icon: '🌌', sub: '500 m' },
  { label: 'Midnight', depth: 1000, icon: '🌑', sub: '1,000 m' },
  { label: 'Abyss', depth: 4000, icon: '❄️', sub: '4,000 m' },
];

export default function DepthJourney({ currentDepth, onDepthChange }) {
  const activeZone =
    DEPTH_ZONES.find(
      (zone) =>
        currentDepth >= zone.depthMin && currentDepth < zone.depthMax
    ) || DEPTH_ZONES[0];

  const calculatedPressure = Math.max(
    1,
    Math.round(1 + currentDepth / 10)
  );

  const calculatedTemp =
    currentDepth < 100
      ? (28.5 - (currentDepth / 100) * 4).toFixed(1)
      : (4 + 20 * Math.exp(-currentDepth / 450)).toFixed(1);

  const sunlight =
    currentDepth < 200
      ? `${Math.max(1, Math.round(100 - currentDepth / 2))}%`
      : '0%';

  const sliderProgress = Math.min((currentDepth / 5000) * 100, 100);

  const isPresetActive = (presetDepth) =>
    Math.abs(currentDepth - presetDepth) < 150;

  return (
    <motion.aside
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="
        relative flex w-[332px] max-h-[calc(100vh-132px)]
        flex-col overflow-hidden
        rounded-[22px]
        border border-white/[0.10]
        bg-[#071525]/88
        text-slate-100
        shadow-[0_20px_60px_rgba(0,0,0,0.45)]
        backdrop-blur-2xl
        select-none
      "
      aria-label="Ocean depth explorer"
    >
      {/* Ambient accent */}
      <div
        className="pointer-events-none absolute left-0 top-0 h-24 w-full opacity-20 blur-3xl"
        style={{ background: activeZone.color }}
      />

      {/* Header */}
      <div className="relative border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="
                flex h-9 w-9 shrink-0 items-center justify-center
                rounded-xl
                border border-cyan-300/20
                bg-cyan-300/[0.08]
                text-cyan-300
              "
            >
              <Compass size={18} strokeWidth={1.8} />
            </div>

            <div className="min-w-0">
              <p className="text-[13px] font-semibold tracking-[-0.01em] text-white">
                Ocean Depth Journey
              </p>
              <p className="mt-0.5 text-[10px] font-medium tracking-[0.08em] text-cyan-300/90">
                FIVE VERTICAL OCEAN ZONES
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.75)]" />
            <span className="font-mono text-[9px] tracking-[0.08em] text-emerald-200/80">
              LIVE
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto p-3.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/60">

        {/* Depth HUD */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3.5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Submersible depth
              </p>

              <div className="mt-1 flex items-baseline gap-1.5">
                <motion.span
                  key={currentDepth}
                  initial={{ opacity: 0.5, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="font-mono text-[27px] font-bold tracking-[-0.04em] text-white"
                >
                  {currentDepth.toLocaleString()}
                </motion.span>

                <span className="font-mono text-[11px] text-slate-500">
                  METERS
                </span>
              </div>
            </div>

            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl border"
              style={{
                color: activeZone.color,
                borderColor: `${activeZone.color}35`,
                background: `${activeZone.color}0D`,
              }}
            >
              <Gauge size={17} />
            </div>
          </div>

          {/* Slider */}
          <div className="relative">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800">
              <motion.div
                className="absolute left-0 top-0 h-full rounded-full"
                animate={{ width: `${sliderProgress}%` }}
                transition={{ duration: 0.18 }}
                style={{
                  background: `linear-gradient(90deg, #18C8FF, ${activeZone.color})`,
                }}
              />
            </div>

            <input
              type="range"
              min="0"
              max="5000"
              step="25"
              value={currentDepth}
              onChange={(e) => onDepthChange(Number(e.target.value))}
              aria-label="Submersible depth"
              className="
                absolute inset-0
                h-1.5 w-full
                cursor-pointer
                appearance-none
                bg-transparent
                opacity-0
              "
            />

            <motion.div
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-white/90 bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.65)]"
              animate={{ left: `calc(${sliderProgress}% - 7px)` }}
            />
          </div>

          <div className="mt-2 flex justify-between font-mono text-[9px] text-slate-500">
            <span>0 m</span>
            <span>2,500 m</span>
            <span>5,000 m</span>
          </div>

          {/* Telemetry */}
          <div className="mt-3 grid grid-cols-3 divide-x divide-white/[0.06] border-t border-white/[0.06] pt-3">
            <div className="pr-2">
              <div className="mb-1 flex items-center gap-1 text-[8px] uppercase tracking-[0.12em] text-slate-500">
                <Waves size={10} />
                Pressure
              </div>
              <p className="font-mono text-[12px] font-semibold text-amber-300">
                {calculatedPressure} atm
              </p>
            </div>

            <div className="px-2">
              <div className="mb-1 flex items-center gap-1 text-[8px] uppercase tracking-[0.12em] text-slate-500">
                <Thermometer size={10} />
                Temp
              </div>
              <p className="font-mono text-[12px] font-semibold text-emerald-300">
                {calculatedTemp}°C
              </p>
            </div>

            <div className="pl-2">
              <div className="mb-1 text-[8px] uppercase tracking-[0.12em] text-slate-500">
                Sunlight
              </div>
              <p className="font-mono text-[12px] font-semibold text-sky-300">
                {sunlight}
              </p>
            </div>
          </div>
        </section>

        {/* Quick presets */}
        <section className="mt-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-300/[0.07] text-cyan-300">
              <ArrowDown size={13} />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-200">
                Quick dive
              </p>
              <p className="text-[9px] text-slate-500">
                Jump to a known depth
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {DIVE_PRESETS.map((preset) => {
              const active = isPresetActive(preset.depth);

              return (
                <motion.button
                  key={preset.depth}
                  type="button"
                  onClick={() => onDepthChange(preset.depth)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    group flex items-center gap-2
                    rounded-xl
                    border px-2.5 py-2
                    text-left
                    transition-colors
                    ${
                      active
                        ? 'border-cyan-300/30 bg-cyan-300/[0.08] text-white'
                        : 'border-white/[0.06] bg-white/[0.025] text-slate-400 hover:border-white/[0.11] hover:bg-white/[0.045] hover:text-slate-200'
                    }
                  `}
                >
                  <span
                    className={`
                      flex h-7 w-7 shrink-0 items-center justify-center
                      rounded-lg
                      ${
                        active
                          ? 'bg-cyan-300/[0.10]'
                          : 'bg-white/[0.035]'
                      }
                    `}
                  >
                    <span className="text-[13px]">{preset.icon}</span>
                  </span>

                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold">
                      {preset.label}
                    </span>
                    <span className="block font-mono text-[8px] text-slate-500">
                      {preset.sub}
                    </span>
                  </span>

                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_7px_rgba(34,211,238,0.7)]" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Depth zones */}
        <section className="mt-4">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-300/[0.07] text-amber-300">
              <Sparkles size={13} />
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-200">
                Ocean zones
              </p>
              <p className="text-[9px] text-slate-500">
                Your position through the water column
              </p>
            </div>
          </div>

          <div className="relative space-y-1.5 pl-2">
            {/* Timeline rail */}
            <div className="absolute bottom-4 left-[15px] top-4 w-px bg-gradient-to-b from-sky-400/50 via-indigo-400/40 to-rose-400/40" />

            {DEPTH_ZONES.map((zone) => {
              const Icon = zone.icon;
              const isCurrent = activeZone.id === zone.id;

              return (
                <motion.button
                  key={zone.id}
                  type="button"
                  onClick={() =>
                    onDepthChange(
                      zone.depthMin +
                        (zone.id === 'sunlight' ? 50 : 250)
                    )
                  }
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.995 }}
                  className={`
                    relative block w-full overflow-hidden rounded-xl
                    border text-left
                    transition-all duration-200
                    ${
                      isCurrent
                        ? 'border-white/[0.12] bg-white/[0.05]'
                        : 'border-transparent bg-transparent hover:border-white/[0.06] hover:bg-white/[0.025]'
                    }
                  `}
                >
                  {isCurrent && (
                    <motion.div
                      layoutId="activeDepthZone"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: `linear-gradient(90deg, ${zone.color}13 0%, transparent 72%)`,
                      }}
                    />
                  )}

                  <div className="relative flex gap-3 px-2.5 py-2.5">
                    {/* Zone marker */}
                    <div
                      className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                      style={{
                        color: zone.color,
                        borderColor: `${zone.color}${isCurrent ? '70' : '35'}`,
                        background: `${zone.color}${isCurrent ? '18' : '0D'}`,
                        boxShadow: isCurrent
                          ? `0 0 18px ${zone.color}20`
                          : 'none',
                      }}
                    >
                      <Icon size={14} />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[11px] font-semibold ${
                            isCurrent
                              ? 'text-white'
                              : 'text-slate-300'
                          }`}
                        >
                          {zone.name}
                        </span>

                        {isCurrent && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em]"
                            style={{
                              color: zone.color,
                              background: `${zone.color}14`,
                              border: `1px solid ${zone.color}28`,
                            }}
                          >
                            Current depth
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 font-mono text-[8px] text-slate-500">
                        {zone.range} · {zone.scientificName}
                      </div>

                      <AnimatePresence initial={false}>
                        {isCurrent && (
                          <motion.div
                            initial={{
                              opacity: 0,
                              height: 0,
                              marginTop: 0,
                            }}
                            animate={{
                              opacity: 1,
                              height: 'auto',
                              marginTop: 7,
                            }}
                            exit={{
                              opacity: 0,
                              height: 0,
                              marginTop: 0,
                            }}
                            transition={{ duration: 0.22 }}
                            className="overflow-hidden"
                          >
                            <p className="text-[9px] leading-[1.55] text-slate-400">
                              {zone.description}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-md bg-white/[0.035] px-1.5 py-1 font-mono text-[7px] text-slate-500">
                                TEMP {zone.temperature}
                              </span>

                              <span className="rounded-md bg-white/[0.035] px-1.5 py-1 font-mono text-[7px] text-slate-500">
                                PRESSURE {zone.pressure}
                              </span>

                              <span className="rounded-md bg-white/[0.035] px-1.5 py-1 font-mono text-[7px] text-slate-500">
                                LIGHT {zone.light}
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>
      </div>
    </motion.aside>
  );
}