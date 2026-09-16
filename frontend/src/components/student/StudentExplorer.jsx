import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Waves, Volume2, VolumeX, RotateCcw, Info, Sparkles } from 'lucide-react';
import DeepSeaScene from './DeepSeaScene';
import DepthJourney from './DepthJourney';
import VariableEducationCard from './VariableEducationCard';
import OceanFactCard from './OceanFactCard';
import StudentObservationCard from './StudentObservationCard';
import ModeSwitcher from '../mode/ModeSwitcher';

export default function StudentExplorer() {
  const [currentDepth, setCurrentDepth] = useState(0);
  const [currentZone, setCurrentZone] = useState('Sunlight Zone');
  const [selectedVariable, setSelectedVariable] = useState('temperature');
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  const handleResetDive = () => {
    setCurrentDepth(0);
    setSelectedMarker(null);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 font-sans select-none">
      
      {/* 1. Fullscreen Three.js 3D Deep Sea Scene */}
      <DeepSeaScene
        currentDepth={currentDepth}
        onSelectMarker={setSelectedMarker}
        onZoneChange={setCurrentZone}
      />

      {/* 2. Top Floating Navigation & Mode Bar */}
      <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none">
        
        {/* Left: Brand Badge & Zone Indicator */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl">
            <div className="p-1.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Waves size={16} />
            </div>
            <div>
              <div className="text-xs font-black text-white tracking-wide flex items-center gap-1.5">
                <span>oceanStream</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500 text-slate-950 font-mono font-bold">
                  STUDENT 3D
                </span>
              </div>
              <div className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>{currentZone}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Mode Switcher */}
        <div className="pointer-events-auto">
          <ModeSwitcher />
        </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={handleResetDive}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-200 shadow-xl backdrop-blur-md transition-all cursor-pointer"
            title="Return to surface (0m)"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Surface</span>
          </button>
          
          <button
            onClick={() => setShowGuide(!showGuide)}
            className={`p-2 rounded-xl border text-xs font-semibold shadow-xl backdrop-blur-md transition-all cursor-pointer ${
              showGuide
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                : 'bg-slate-900/90 border-slate-700/80 text-slate-200 hover:bg-slate-800'
            }`}
            title="How to explore"
          >
            <Info size={16} />
          </button>
        </div>
      </div>

      {/* 3. Left Panel: Depth Journey & Zones */}
      <div className="absolute top-20 left-4 z-30 pointer-events-auto">
        <DepthJourney
          currentDepth={currentDepth}
          onDepthChange={setCurrentDepth}
        />
      </div>

      {/* 4. Right Panel: Variables & Ocean Facts */}
      <div className="absolute top-20 right-4 z-30 flex flex-col gap-3 pointer-events-auto">
        <VariableEducationCard
          selectedVariable={selectedVariable}
          onSelectVariable={setSelectedVariable}
        />
        <OceanFactCard />
      </div>

      {/* 5. Observation Float / Glider Modal */}
      <AnimatePresence>
        {selectedMarker && (
          <StudentObservationCard
            marker={selectedMarker}
            onClose={() => setSelectedMarker(null)}
          />
        )}
      </AnimatePresence>

      {/* 6. Educational Exploration Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
            onClick={() => setShowGuide(false)}
          >
            <div
              className="max-w-md p-6 rounded-3xl bg-slate-900 border border-cyan-500/40 shadow-2xl text-slate-100 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5 text-cyan-300">
                <Sparkles size={20} />
                <h3 className="text-base font-bold">Welcome to 3D Ocean Exploration!</h3>
              </div>

              <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                <p>
                  🌊 <strong>Dive into the Deep Ocean:</strong> Use the depth slider on the left or click zone presets to dive down to 5,000 meters. Watch how the lighting, creatures, and water pressure change as you go deeper!
                </p>
                <p>
                  🐠 <strong>Observe Marine Life:</strong> Schooling fish thrive in the sunlight zone, manta rays glide through the twilight zone, bioluminescent jellyfish light up the midnight zone, and deep-sea anglerfish hunt in the abyss!
                </p>
                <p>
                  🤖 <strong>Click Robot Floats:</strong> Click on glowing Argo floats floating in the water column to learn how robotic probes gather real ocean scientific data.
                </p>
                <p>
                  🔬 <strong>Want Real Scientific Data?</strong> Switch to <strong>Scientist Mode</strong> using the top switcher to access live Copernicus forecasts, vertical Argo profiles, and real-time point queries!
                </p>
              </div>

              <button
                onClick={() => setShowGuide(false)}
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide transition-all shadow-lg cursor-pointer"
              >
                Let's Dive! 🌊
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. Bottom Ambient Caption Bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="px-4 py-2 rounded-full bg-slate-900/80 border border-slate-700/60 backdrop-blur-md text-[11px] text-slate-300 font-medium flex items-center gap-2 shadow-xl">
          <span className="text-cyan-400 font-bold">Tip:</span>
          <span>Click and drag to rotate the view. Click yellow/green Argo probes to discover robotic floats!</span>
        </div>
      </div>
    </div>
  );
}
