import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Thermometer,
  Droplets,
  Wind,
  Leaf,
  Activity,
  Info,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';

const STUDENT_VARIABLES = [
  {
    id: 'temperature',
    short: 'TEMP',
    name: 'Ocean Temperature',
    unit: '°C',
    icon: Thermometer,
    color: '#fb7185',
    summary: 'How warm or cold seawater is at different depths.',
    analogy:
      'Like a blanket on Earth! Warmer water stays near the surface, while the deep ocean is much colder.',
    fact: 'The ocean absorbs more than 90% of excess heat from global warming, helping regulate our atmosphere.',
  },
  {
    id: 'salinity',
    short: 'SALI',
    name: 'Ocean Salinity',
    unit: 'PSU',
    icon: Droplets,
    color: '#38bdf8',
    summary: 'The amount of dissolved salt present in seawater.',
    analogy:
      'Imagine dissolving salt into water — more dissolved salt makes seawater denser and changes how it moves.',
    fact: 'Differences in temperature and salinity help drive large-scale ocean circulation.',
  },
  {
    id: 'currents',
    short: 'CURR',
    name: 'Ocean Currents',
    unit: 'm/s',
    icon: Wind,
    color: '#818cf8',
    summary: 'Large-scale movements of seawater across the ocean.',
    analogy:
      'Think of them as invisible highways carrying heat, nutrients and marine life across the planet.',
    fact: 'Ocean currents redistribute heat around Earth and strongly influence climate and ecosystems.',
  },
  {
    id: 'chlorophyll',
    short: 'CHL-A',
    name: 'Chlorophyll-a',
    unit: 'mg/m³',
    icon: Leaf,
    color: '#34d399',
    summary: 'A key indicator of microscopic marine plant life called phytoplankton.',
    analogy:
      'Think of phytoplankton as tiny underwater forests — they use sunlight to create energy.',
    fact: 'Chlorophyll observations help scientists identify regions of high biological productivity.',
  },
  {
    id: 'oxygen',
    short: 'O₂',
    name: 'Dissolved Oxygen',
    unit: 'mmol/m³',
    icon: Activity,
    color: '#22d3ee',
    summary: 'Oxygen dissolved in seawater that supports marine life.',
    analogy:
      'Fish breathe oxygen from water through their gills, just as humans breathe oxygen from air.',
    fact: 'Oxygen availability changes with depth, temperature, biology and ocean circulation.',
  },
];

export default function VariableEducationCard({
  selectedVariable,
  onSelectVariable,
}) {
  const [expandedId, setExpandedId] = useState(
    selectedVariable || 'temperature'
  );

  const activeVar =
    STUDENT_VARIABLES.find((v) => v.id === expandedId) ||
    STUDENT_VARIABLES[0];

  const ActiveIcon = activeVar.icon;

  const handleSelect = (id) => {
    setExpandedId(id);
    onSelectVariable?.(id);
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="
        relative
        w-[336px]
        overflow-hidden
        rounded-[22px]
        border border-white/[0.10]
        bg-[#071525]/88
        text-slate-100
        shadow-[0_20px_60px_rgba(0,0,0,0.42)]
        backdrop-blur-2xl
        select-none
      "
      aria-label="Ocean science explorer"
    >
      {/* Ambient accent */}
      <motion.div
        key={activeVar.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="pointer-events-none absolute right-0 top-0 h-32 w-40 blur-3xl"
        style={{
          background: `${activeVar.color}18`,
        }}
      />

      {/* Header */}
      <div className="relative border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{
              borderColor: `${activeVar.color}45`,
              backgroundColor: `${activeVar.color}0D`,
              color: activeVar.color,
            }}
            transition={{ duration: 0.25 }}
            className="
              flex h-9 w-9 shrink-0 items-center justify-center
              rounded-xl border
            "
          >
            <Leaf size={17} strokeWidth={1.8} />
          </motion.div>

          <div className="min-w-0">
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-white">
              Ocean Science Explorer
            </p>

            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.6)]" />
              <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-emerald-200/75">
                Learn the ocean
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative p-3">

        {/* Variable selector */}
        <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-1">
          <div className="grid grid-cols-5 gap-0.5">
            {STUDENT_VARIABLES.map((variable) => {
              const Icon = variable.icon;
              const isSelected = expandedId === variable.id;

              return (
                <button
                  key={variable.id}
                  type="button"
                  onClick={() => handleSelect(variable.id)}
                  title={variable.name}
                  aria-label={variable.name}
                  aria-pressed={isSelected}
                  className={`
                    group relative flex min-h-[54px]
                    flex-col items-center justify-center
                    rounded-xl
                    transition-colors duration-200
                    ${
                      isSelected
                        ? 'text-white'
                        : 'text-slate-500 hover:bg-white/[0.035] hover:text-slate-300'
                    }
                  `}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="student-variable-active"
                      className="absolute inset-0 rounded-xl"
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 32,
                      }}
                      style={{
                        background: `${variable.color}10`,
                        border: `1px solid ${variable.color}30`,
                      }}
                    />
                  )}

                  <span
                    className="
                      relative z-10
                      flex h-7 w-7 items-center justify-center
                      rounded-lg
                    "
                    style={{
                      background: isSelected
                        ? `${variable.color}12`
                        : 'transparent',
                    }}
                  >
                    <Icon
                      size={15}
                      strokeWidth={1.8}
                      style={{
                        color: isSelected
                          ? variable.color
                          : undefined,
                      }}
                    />
                  </span>

                  <span
                    className={`
                      relative z-10 mt-1
                      font-mono text-[8px] font-semibold
                      tracking-[0.04em]
                      ${
                        isSelected
                          ? 'text-slate-200'
                          : 'text-slate-600 group-hover:text-slate-400'
                      }
                    `}
                  >
                    {variable.short}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active variable */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeVar.id}
            initial={{
              opacity: 0,
              y: 7,
              filter: 'blur(2px)',
            }}
            animate={{
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
            }}
            exit={{
              opacity: 0,
              y: -5,
              filter: 'blur(2px)',
            }}
            transition={{
              duration: 0.24,
              ease: 'easeOut',
            }}
            className="mt-2.5"
          >
            {/* Main information */}
            <div
              className="
                relative overflow-hidden
                rounded-2xl
                border
                bg-white/[0.025]
              "
              style={{
                borderColor: `${activeVar.color}32`,
              }}
            >
              {/* Top color accent */}
              <div
                className="absolute left-0 right-0 top-0 h-px"
                style={{
                  background: `linear-gradient(90deg, transparent, ${activeVar.color}80, transparent)`,
                }}
              />

              <div className="p-3.5">

                {/* Variable identity */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                      style={{
                        color: activeVar.color,
                        borderColor: `${activeVar.color}30`,
                        background: `${activeVar.color}0D`,
                      }}
                    >
                      <ActiveIcon size={19} strokeWidth={1.8} />
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate text-[13px] font-semibold text-white">
                        {activeVar.name}
                      </h3>

                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className="font-mono text-[9px] font-medium"
                          style={{
                            color: `${activeVar.color}CC`,
                          }}
                        >
                          {activeVar.id}
                        </span>

                        <span className="h-1 w-1 rounded-full bg-slate-700" />

                        <span className="font-mono text-[9px] text-slate-500">
                          {activeVar.unit}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex h-6 shrink-0 items-center gap-1 rounded-full border px-2"
                    style={{
                      borderColor: `${activeVar.color}25`,
                      color: activeVar.color,
                      background: `${activeVar.color}08`,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    <span className="font-mono text-[7px] font-semibold uppercase tracking-[0.08em]">
                      Active
                    </span>
                  </div>
                </div>

                {/* Explanation */}
                <p className="mt-3 text-[10px] leading-[1.65] text-slate-300">
                  {activeVar.summary}
                </p>

                {/* Analogy */}
                <div className="mt-3 rounded-xl border border-cyan-300/[0.10] bg-cyan-300/[0.025] p-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Sparkles
                      size={11}
                      className="text-cyan-300"
                    />

                    <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
                      Easy analogy
                    </span>
                  </div>

                  <p className="text-[10px] leading-[1.6] text-slate-400">
                    “{activeVar.analogy}”
                  </p>
                </div>

                {/* Fact */}
                <div
                  className="mt-2 flex gap-2 rounded-xl border p-2.5"
                  style={{
                    borderColor: 'rgba(251, 191, 36, 0.16)',
                    background: 'rgba(251, 191, 36, 0.035)',
                  }}
                >
                  <Info
                    size={12}
                    className="mt-0.5 shrink-0 text-amber-300"
                  />

                  <p className="text-[9px] leading-[1.55] text-amber-100/75">
                    <span className="font-semibold text-amber-200">
                      Did you know?
                    </span>{' '}
                    {activeVar.fact}
                  </p>
                </div>

                {/* Learn more affordance */}
                <div
                  className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5"
                >
                  <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">
                    Ocean variable
                  </span>

                  <span
                    className="flex items-center gap-1 text-[9px] font-medium"
                    style={{ color: activeVar.color }}
                  >
                    Explore on globe
                    <ArrowUpRight size={11} />
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}