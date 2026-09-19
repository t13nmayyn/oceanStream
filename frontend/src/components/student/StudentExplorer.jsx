import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw,
  Info,
  Sparkles,
  Waves,
} from 'lucide-react';

import DeepSeaScene from './DeepSeaScene';
import DepthJourney from './DepthJourney';
import VariableEducationCard from './VariableEducationCard';
import OceanFactCard from './OceanFactCard';
import StudentObservationCard from './StudentObservationCard';
import { useApp, useAppDispatch } from '../../context/AppContext';

export default function StudentExplorer() {
  const { selectedDepth } = useApp();
  const dispatch = useAppDispatch();
  const [currentDepth, setCurrentDepth] = useState(selectedDepth ?? 0);
  const [currentZone, setCurrentZone] = useState('Sunlight Zone');
  const [selectedVariable, setSelectedVariable] = useState('temperature');
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (typeof selectedDepth === 'number' && Number.isFinite(selectedDepth)) {
      setCurrentDepth(selectedDepth);
    }
  }, [selectedDepth]);

  const handleDepthChange = (depth) => {
    setCurrentDepth(depth);
    dispatch?.({ type: 'SET_DEPTH', payload: depth });
  };

  const handleResetDive = () => {
    setCurrentDepth(0);
    dispatch?.({ type: 'SET_DEPTH', payload: 0 });
    setSelectedMarker(null);
  };

  return (
    <main className="relative h-full w-full overflow-hidden bg-slate-950 font-sans select-none">

      {/* =========================================================
          3D SCENE
          DO NOT MODIFY DeepSeaScene OR ITS BEHAVIOUR
         ========================================================= */}
      <DeepSeaScene
        currentDepth={currentDepth}
        onSelectMarker={setSelectedMarker}
        onZoneChange={setCurrentZone}
      />

      {/* =========================================================
          STUDENT HUD
          Lightweight contextual overlay
         ========================================================= */}

      {/* Current zone indicator */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="
          pointer-events-none
          absolute left-5 top-5 z-30
          hidden sm:block
        "
      >
        <div
          className="
            flex items-center gap-2.5
            rounded-2xl
            border border-white/[0.10]
            bg-slate-950/60
            px-3 py-2
            shadow-[0_12px_35px_rgba(0,0,0,0.3)]
            backdrop-blur-xl
          "
        >
          <div className="
            flex h-7 w-7 items-center justify-center
            rounded-xl
            border border-cyan-300/20
            bg-cyan-300/[0.07]
            text-cyan-300
          ">
            <Waves size={14} />
          </div>

          <div>
            <p className="
              text-[8px]
              font-semibold
              uppercase
              tracking-[0.16em]
              text-slate-500
            ">
              Current zone
            </p>

            <p className="
              mt-0.5
              text-[11px]
              font-semibold
              text-white
            ">
              {currentZone}
            </p>
          </div>

          <span className="
            ml-1
            h-1.5 w-1.5
            rounded-full
            bg-cyan-300
            shadow-[0_0_10px_rgba(34,211,238,0.8)]
          " />
        </div>
      </motion.div>

      {/* Quick actions */}
      <div
        className="
          absolute right-5 top-5 z-30
          flex items-center gap-2
        "
      >
        <motion.button
          type="button"
          onClick={handleResetDive}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          className="
            flex items-center gap-2
            rounded-xl
            border border-white/[0.09]
            bg-slate-950/60
            px-3 py-2
            text-[10px]
            font-semibold
            text-slate-300
            shadow-[0_12px_35px_rgba(0,0,0,0.3)]
            backdrop-blur-xl
            transition-colors
            hover:border-white/[0.15]
            hover:bg-slate-900/75
            hover:text-white
          "
          title="Return to surface"
        >
          <RotateCcw size={13} />
          <span className="hidden sm:inline">Return to surface</span>
        </motion.button>

        <motion.button
          type="button"
          onClick={() => setShowGuide((value) => !value)}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          aria-label="Open exploration guide"
          title="How to explore"
          className={`
            flex h-9 w-9 items-center justify-center
            rounded-xl
            border
            shadow-[0_12px_35px_rgba(0,0,0,0.3)]
            backdrop-blur-xl
            transition-colors
            ${
              showGuide
                ? 'border-cyan-300/35 bg-cyan-300/[0.10] text-cyan-200'
                : 'border-white/[0.09] bg-slate-950/60 text-slate-300 hover:border-white/[0.15] hover:bg-slate-900/75 hover:text-white'
            }
          `}
        >
          <Info size={15} />
        </motion.button>
      </div>

      {/* =========================================================
          LEFT EDUCATIONAL PANEL
         ========================================================= */}
      <motion.section
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: 0.45,
          delay: 0.08,
          ease: 'easeOut',
        }}
        className="
          pointer-events-auto
          absolute
          left-4
          top-20
          z-30
          max-w-[calc(100vw-2rem)]
        "
      >
        <DepthJourney
          currentDepth={currentDepth}
          onDepthChange={handleDepthChange}
        />
      </motion.section>

      {/* =========================================================
          RIGHT EDUCATIONAL STACK
         ========================================================= */}
      <motion.section
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: 0.45,
          delay: 0.14,
          ease: 'easeOut',
        }}
        className="
          pointer-events-auto
          absolute
          right-4
          top-20
          z-30
          flex
          max-h-[calc(100vh-110px)]
          max-w-[calc(100vw-2rem)]
          flex-col
          gap-2.5
        "
      >
        <VariableEducationCard
          selectedVariable={selectedVariable}
          onSelectVariable={setSelectedVariable}
        />

        <OceanFactCard />
      </motion.section>

      {/* =========================================================
          FLOAT / GLIDER EDUCATION
         ========================================================= */}
      <AnimatePresence>
        {selectedMarker && (
          <StudentObservationCard
            marker={selectedMarker}
            onClose={() => setSelectedMarker(null)}
          />
        )}
      </AnimatePresence>

      {/* =========================================================
          EXPLORATION GUIDE
         ========================================================= */}
      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="
              absolute inset-0 z-50
              flex items-center justify-center
              bg-slate-950/55
              p-4
              backdrop-blur-md
            "
            onClick={() => setShowGuide(false)}
          >
            <motion.div
              initial={{
                opacity: 0,
                y: 14,
                scale: 0.97,
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                y: 8,
                scale: 0.98,
              }}
              transition={{
                type: 'spring',
                stiffness: 320,
                damping: 28,
              }}
              className="
                relative
                w-full
                max-w-[430px]
                overflow-hidden
                rounded-[24px]
                border border-white/[0.11]
                bg-[#071525]/95
                p-5
                text-slate-100
                shadow-[0_30px_100px_rgba(0,0,0,0.55)]
              "
              onClick={(event) => event.stopPropagation()}
            >
              {/* ambient glow */}
              <div className="
                pointer-events-none
                absolute -right-12 -top-12
                h-36 w-36
                rounded-full
                bg-cyan-400/[0.08]
                blur-3xl
              " />

              <div className="relative">

                {/* Heading */}
                <div className="flex items-start gap-3">
                  <div className="
                    flex h-10 w-10 shrink-0
                    items-center justify-center
                    rounded-xl
                    border border-cyan-300/20
                    bg-cyan-300/[0.07]
                    text-cyan-300
                  ">
                    <Sparkles size={18} />
                  </div>

                  <div>
                    <p className="
                      text-[9px]
                      font-semibold
                      uppercase
                      tracking-[0.15em]
                      text-cyan-300/75
                    ">
                      Student Explorer
                    </p>

                    <h2 className="
                      mt-1
                      text-[18px]
                      font-semibold
                      tracking-[-0.02em]
                      text-white
                    ">
                      Welcome to the deep
                    </h2>

                    <p className="
                      mt-1
                      text-[10px]
                      leading-relaxed
                      text-slate-400
                    ">
                      Explore ocean depth, marine life and
                      robotic observations through an interactive
                      3D dive.
                    </p>
                  </div>
                </div>

                {/* Instructions */}
                <div className="mt-4 space-y-2">
                  {[
                    [
                      '🌊',
                      'Dive deeper',
                      'Use the depth journey to move through ocean zones.',
                    ],
                    [
                      '🐠',
                      'Discover marine life',
                      'Explore how the environment changes with depth.',
                    ],
                    [
                      '🤖',
                      'Meet ocean robots',
                      'Click glowing observation markers to learn about Argo floats.',
                    ],
                    [
                      '🔬',
                      'Go scientific',
                      'Switch to Scientist Mode for real ocean datasets and analysis.',
                    ],
                  ].map(([icon, title, text]) => (
                    <div
                      key={title}
                      className="
                        flex gap-3
                        rounded-xl
                        border border-white/[0.06]
                        bg-white/[0.025]
                        p-3
                      "
                    >
                      <span className="text-base">{icon}</span>

                      <div>
                        <p className="
                          text-[10px]
                          font-semibold
                          text-slate-200
                        ">
                          {title}
                        </p>

                        <p className="
                          mt-0.5
                          text-[9px]
                          leading-[1.55]
                          text-slate-500
                        ">
                          {text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <motion.button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="
                    mt-4
                    flex w-full
                    items-center justify-center
                    rounded-xl
                    border border-cyan-300/20
                    bg-cyan-300/[0.09]
                    px-4 py-2.5
                    text-[10px]
                    font-semibold
                    text-cyan-100
                    transition-colors
                    hover:bg-cyan-300/[0.14]
                  "
                >
                  Start exploring
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================
          BOTTOM EXPLORATION TIP
         ========================================================= */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.4,
          delay: 0.3,
        }}
        className="
          pointer-events-none
          absolute
          bottom-4
          left-1/2
          z-30
          hidden
          -translate-x-1/2
          md:block
        "
      >
        <div className="
          flex items-center gap-2
          rounded-full
          border border-white/[0.08]
          bg-slate-950/55
          px-3.5 py-2
          text-[9px]
          text-slate-400
          shadow-[0_10px_35px_rgba(0,0,0,0.3)]
          backdrop-blur-xl
        ">
          <span className="font-semibold text-cyan-300">
            TIP
          </span>

          <span className="h-1 w-1 rounded-full bg-slate-700" />

          <span>
            Drag to explore · click glowing probes to discover
            ocean observations
          </span>
        </div>
      </motion.div>

      {/* =========================================================
          MOBILE DEPTH INDICATOR
         ========================================================= */}
      <div className="
        pointer-events-none
        absolute
        bottom-4
        left-4
        z-30
        rounded-xl
        border border-white/[0.08]
        bg-slate-950/55
        px-3 py-2
        backdrop-blur-xl
        md:hidden
      ">
        <p className="
          text-[8px]
          uppercase
          tracking-[0.12em]
          text-slate-500
        ">
          Dive depth
        </p>

        <p className="
          mt-0.5
          font-mono
          text-[12px]
          font-semibold
          text-cyan-300
        ">
          {currentDepth.toLocaleString()} m
        </p>
      </div>
    </main>
  );
}