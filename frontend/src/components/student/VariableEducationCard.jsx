import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Thermometer, Droplets, Wind, Leaf, Activity, Info, Sparkles } from 'lucide-react';

const STUDENT_VARIABLES = [
  {
    id: 'temperature',
    name: 'Ocean Temperature',
    unit: '°C',
    icon: Thermometer,
    color: '#f87171',
    borderColor: 'border-red-500/40',
    bgGradient: 'from-red-500/10 to-orange-500/10',
    summary: 'How warm or cold seawater is at different depths.',
    analogy: 'Like a blanket on Earth! Warmer water stays at the surface, while the deep ocean is near freezing.',
    fact: 'The ocean absorbs more than 90% of excess heat from global warming, shielding our atmosphere.',
  },
  {
    id: 'salinity',
    name: 'Ocean Salinity',
    unit: 'PSU',
    icon: Droplets,
    color: '#38bdf8',
    borderColor: 'border-sky-500/40',
    bgGradient: 'from-sky-500/10 to-blue-500/10',
    summary: 'The amount of dissolved salt in seawater.',
    analogy: 'Imagine adding 35 grams of table salt (about 2 tablespoons) to 1 liter of drinking water!',
    fact: 'Saltier water is heavier and sinks, powering the global ocean conveyor belt of currents.',
  },
  {
    id: 'currents',
    name: 'Ocean Currents',
    unit: 'm/s',
    icon: Wind,
    color: '#818cf8',
    borderColor: 'border-indigo-500/40',
    bgGradient: 'from-indigo-500/10 to-violet-500/10',
    summary: 'Massive underwater rivers flowing through the world’s oceans.',
    analogy: 'Like a global highway system for sea turtles, whales, and heat energy!',
    fact: 'The Gulf Stream carries nearly 100 times more water flow than all the rivers in the world combined.',
  },
  {
    id: 'chlorophyll',
    name: 'Chlorophyll-a',
    unit: 'mg/m³',
    icon: Leaf,
    color: '#34d399',
    borderColor: 'border-emerald-500/40',
    bgGradient: 'from-emerald-500/10 to-teal-500/10',
    summary: 'The green pigment in microscopic ocean plants (phytoplankton).',
    analogy: 'The "pastures of the sea" that produce more than half the oxygen we breathe on Earth!',
    fact: 'High chlorophyll means rich feeding grounds for tuna, dolphins, and blue whales.',
  },
  {
    id: 'oxygen',
    name: 'Dissolved Oxygen',
    unit: 'mmol/m³',
    icon: Activity,
    color: '#22d3ee',
    borderColor: 'border-cyan-500/40',
    bgGradient: 'from-cyan-500/10 to-sky-500/10',
    summary: 'Oxygen gas dissolved in water for fish and marine life to breathe.',
    analogy: 'Just like land animals breathe air through lungs, fish breathe dissolved oxygen using gills.',
    fact: 'Sunlight and waves add oxygen at the surface, while deep ocean currents keep deep animals alive.',
  },
];

export default function VariableEducationCard({ selectedVariable, onSelectVariable }) {
  const [expandedId, setExpandedId] = useState(selectedVariable || 'temperature');

  const activeVar = STUDENT_VARIABLES.find((v) => v.id === expandedId) || STUDENT_VARIABLES[0];

  return (
    <div className="flex flex-col gap-2.5 w-80 p-4 rounded-2xl bg-slate-900/90 border border-slate-700/70 shadow-2xl backdrop-blur-xl text-slate-100 select-none">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Leaf size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Ocean Science Explorer
            </h3>
            <span className="text-[11px] text-emerald-300 font-medium">
              Discover what each variable tells us
            </span>
          </div>
        </div>
      </div>

      {/* Variable Pills */}
      <div className="grid grid-cols-5 gap-1 p-1 bg-slate-950/60 rounded-xl border border-slate-800">
        {STUDENT_VARIABLES.map((v) => {
          const Icon = v.icon;
          const isSelected = expandedId === v.id;
          return (
            <button
              key={v.id}
              onClick={() => {
                setExpandedId(v.id);
                onSelectVariable?.(v.id);
              }}
              className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'bg-slate-800 text-white shadow-md border border-slate-600'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
              title={v.name}
            >
              <Icon size={16} style={{ color: isSelected ? v.color : undefined }} />
              <span className="text-[9px] font-semibold mt-1 truncate max-w-full">
                {v.id.slice(0, 4)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expanded Active Variable Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeVar.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className={`p-3.5 rounded-xl border bg-gradient-to-br ${activeVar.bgGradient} ${activeVar.borderColor} space-y-3`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="p-2 rounded-lg border shadow-sm"
                style={{
                  backgroundColor: `${activeVar.color}20`,
                  borderColor: `${activeVar.color}40`,
                  color: activeVar.color,
                }}
              >
                <activeVar.icon size={18} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{activeVar.name}</div>
                <div className="text-[10px] text-slate-400 font-mono">Unit: {activeVar.unit}</div>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-200 leading-relaxed">
            {activeVar.summary}
          </p>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] space-y-1.5">
            <div className="font-semibold text-cyan-300 flex items-center gap-1">
              <Sparkles size={12} />
              <span>Easy Analogy:</span>
            </div>
            <p className="text-slate-300 italic">
              "{activeVar.analogy}"
            </p>
          </div>

          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-200 flex items-start gap-1.5">
            <Info size={13} className="shrink-0 mt-0.5 text-amber-400" />
            <span><strong>Did you know?</strong> {activeVar.fact}</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
