import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb,
  ArrowRight,
  Sparkles,
  RotateCw,
} from 'lucide-react';

const OCEAN_FACTS = [
  {
    title: 'More than 80% Unexplored',
    content:
      'We have better maps of the surface of Mars and the Moon than we do of the Earth’s deep ocean floor!',
    tag: 'DEEP OCEAN',
    accent: '#22d3ee',
  },
  {
    title: 'The Blue Heart of Earth',
    content:
      'Phytoplankton in the ocean produce more than 50% of the entire Earth’s oxygen supply through photosynthesis.',
    tag: 'ECOSYSTEM',
    accent: '#34d399',
  },
  {
    title: 'Immense Pressure in the Abyss',
    content:
      'At the bottom of the Mariana Trench (11,000m), water pressure exceeds 1,000 atmospheres — equal to having an elephant standing on your thumb!',
    tag: 'HADAL ZONE',
    accent: '#a78bfa',
  },
  {
    title: 'Robot Ocean Fleet',
    content:
      'Nearly 4,000 autonomous robotic Argo floats roam the world ocean right now, continuously diving to 2,000 meters and beaming data back to satellites.',
    tag: 'ARGO ROBOTS',
    accent: '#38bdf8',
  },
  {
    title: 'Underwater Waterfalls Exist',
    content:
      'The Denmark Strait cataract is an underwater waterfall where cold dense water plunges thousands of meters down, carrying an enormous volume of water.',
    tag: 'CURRENTS',
    accent: '#60a5fa',
  },
  {
    title: 'Hydrothermal Vent Oasis',
    content:
      'Superheated water from deep-sea vents can reach extremely high temperatures while remaining liquid under immense pressure, supporting unique ecosystems.',
    tag: 'SEABED',
    accent: '#fb7185',
  },
];

export default function OceanFactCard({ className = '' }) {
  const [index, setIndex] = useState(0);

  const fact = OCEAN_FACTS[index];

  const nextFact = () => {
    setIndex((prev) => (prev + 1) % OCEAN_FACTS.length);
  };

  return (
    <motion.aside
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={`
        relative
        w-[336px]
        overflow-hidden
        rounded-[22px]
        border border-white/[0.10]
        bg-[#071525]/88
        text-slate-100
        shadow-[0_20px_55px_rgba(0,0,0,0.38)]
        backdrop-blur-2xl
        select-none
        ${className}
      `}
    >
      {/* Ambient glow */}
      <motion.div
        key={fact.tag}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl"
        style={{
          background: `${fact.accent}18`,
        }}
      />

      {/* Top accent line */}
      <div
        className="absolute left-6 right-6 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${fact.accent}70, transparent)`,
        }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl border"
            style={{
              color: fact.accent,
              borderColor: `${fact.accent}30`,
              background: `${fact.accent}0D`,
            }}
          >
            <Lightbulb size={15} strokeWidth={1.8} />
          </div>

          <div>
            <p className="text-[11px] font-semibold text-white">
              Did you know?
            </p>

            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="font-mono text-[8px] uppercase tracking-[0.13em] text-slate-500">
                Ocean discovery
              </span>

              <span className="h-1 w-1 rounded-full bg-slate-700" />

              <span
                className="font-mono text-[8px] font-semibold tracking-[0.08em]"
                style={{ color: `${fact.accent}CC` }}
              >
                {String(index + 1).padStart(2, '0')} /{' '}
                {String(OCEAN_FACTS.length).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>

        {/* Refresh */}
        <motion.button
          type="button"
          onClick={nextFact}
          whileHover={{ rotate: 30 }}
          whileTap={{ scale: 0.92 }}
          aria-label="Show another ocean fact"
          title="Another discovery"
          className="
            flex h-8 w-8 items-center justify-center
            rounded-xl
            border border-white/[0.07]
            bg-white/[0.025]
            text-slate-500
            transition-colors duration-200
            hover:border-white/[0.12]
            hover:bg-white/[0.05]
            hover:text-slate-200
          "
        >
          <RotateCw size={13} />
        </motion.button>
      </div>

      {/* Fact */}
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{
            opacity: 0,
            y: 8,
            filter: 'blur(2px)',
          }}
          animate={{
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
          }}
          exit={{
            opacity: 0,
            y: -8,
            filter: 'blur(2px)',
          }}
          transition={{
            duration: 0.24,
            ease: 'easeOut',
          }}
          className="relative px-4 pb-3.5 pt-3"
        >
          {/* Tag */}
          <div className="mb-2">
            <span
              className="
                inline-flex
                items-center
                rounded-full
                border
                px-2
                py-1
                font-mono
                text-[7px]
                font-semibold
                uppercase
                tracking-[0.12em]
              "
              style={{
                color: fact.accent,
                borderColor: `${fact.accent}28`,
                background: `${fact.accent}09`,
              }}
            >
              {fact.tag}
            </span>
          </div>

          {/* Title */}
          <h4 className="max-w-[280px] text-[17px] font-semibold leading-[1.2] tracking-[-0.02em] text-white">
            {fact.title}
          </h4>

          {/* Decorative rule */}
          <div className="mt-2.5 flex items-center gap-2">
            <div
              className="h-px w-8"
              style={{
                background: fact.accent,
                opacity: 0.55,
              }}
            />

            <Sparkles
              size={10}
              style={{ color: fact.accent }}
              className="opacity-70"
            />
          </div>

          {/* Content */}
          <p className="mt-2.5 text-[10px] leading-[1.7] text-slate-300/90">
            {fact.content}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Bottom action */}
      <div className="relative border-t border-white/[0.06] px-4 py-2.5">
        <motion.button
          type="button"
          onClick={nextFact}
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.985 }}
          className="
            group flex w-full items-center justify-between
            rounded-xl
            border border-white/[0.06]
            bg-white/[0.025]
            px-3 py-2
            text-left
            transition-all duration-200
            hover:border-white/[0.11]
            hover:bg-white/[0.045]
          "
        >
          <div>
            <span className="block text-[9px] font-semibold text-slate-200">
              Discover another
            </span>
            <span className="mt-0.5 block font-mono text-[7px] uppercase tracking-[0.1em] text-slate-600">
              Explore the ocean
            </span>
          </div>

          <span
            className="
              flex h-7 w-7 items-center justify-center
              rounded-lg
              border
              transition-all duration-200
              group-hover:translate-x-0.5
            "
            style={{
              color: fact.accent,
              borderColor: `${fact.accent}25`,
              background: `${fact.accent}08`,
            }}
          >
            <ArrowRight size={13} />
          </span>
        </motion.button>

        {/* Progress */}
        <div className="mt-2 flex gap-1">
          {OCEAN_FACTS.map((item, i) => (
            <button
              key={item.tag}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show fact ${i + 1}`}
              className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]"
            >
              <motion.div
                animate={{
                  width: i === index ? '100%' : '0%',
                }}
                transition={{ duration: 0.25 }}
                className="h-full rounded-full"
                style={{ background: fact.accent }}
              />
            </button>
          ))}
        </div>
      </div>
    </motion.aside>
  );
}