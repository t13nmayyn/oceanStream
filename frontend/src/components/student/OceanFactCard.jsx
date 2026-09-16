import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, RefreshCw, ChevronRight } from 'lucide-react';

const OCEAN_FACTS = [
  {
    title: 'More than 80% Unexplored',
    content: 'We have better maps of the surface of Mars and the Moon than we do of the Earth’s deep ocean floor!',
    tag: 'Deep Ocean',
  },
  {
    title: 'The Blue Heart of Earth',
    content: 'Phytoplankton in the ocean produce more than 50% of the entire Earth’s oxygen supply through photosynthesis.',
    tag: 'Ecosystem',
  },
  {
    title: 'Immense Pressure in the Abyss',
    content: 'At the bottom of the Mariana Trench (11,000m), water pressure exceeds 1,000 atmospheres — equal to having an elephant standing on your thumb!',
    tag: 'Hadal Zone',
  },
  {
    title: 'Robot Ocean Fleet (Argo Floats)',
    content: 'Nearly 4,000 autonomous robotic Argo floats roam the world ocean right now, continuously diving to 2,000 meters and beaming real-time data back to satellites.',
    tag: 'Argo Robots',
  },
  {
    title: 'Underwater Waterfalls exist!',
    content: 'The Denmark Strait cataract is an underwater waterfall where cold dense water plunges 3,500 meters down, flowing with 175 times the volume of Niagara Falls.',
    tag: 'Currents',
  },
  {
    title: 'Hydrothermal Vent Oasis',
    content: 'Superheated water spewing from deep-sea chimneys reaches 400°C without boiling due to extreme pressure, supporting bizarre tubeworms and yeti crabs.',
    tag: 'Seabed',
  },
];

export default function OceanFactCard({ className = '' }) {
  const [index, setIndex] = useState(0);

  const nextFact = () => {
    setIndex((prev) => (prev + 1) % OCEAN_FACTS.length);
  };

  const fact = OCEAN_FACTS[index];

  return (
    <div
      className={`p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl text-slate-100 select-none ${className}`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
          <Lightbulb size={14} className="text-amber-400 animate-pulse" />
          <span>Did You Know?</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-750">
            {fact.tag}
          </span>
          <button
            onClick={nextFact}
            className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            title="Next fact"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.2 }}
          className="pt-2.5 space-y-1.5"
        >
          <h4 className="text-xs font-bold text-white tracking-wide">
            {fact.title}
          </h4>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            {fact.content}
          </p>
        </motion.div>
      </AnimatePresence>

      <button
        onClick={nextFact}
        className="mt-2.5 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-800/80 hover:bg-cyan-500/20 text-cyan-300 text-[11px] font-semibold transition-all border border-slate-700/60 hover:border-cyan-400/50 cursor-pointer"
      >
        <span>Next Ocean Discovery</span>
        <ChevronRight size={12} />
      </button>
    </div>
  );
}
