import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Microscope, Activity, Radio, Layers } from 'lucide-react';
import MapView from '../map/MapView';
import ScientificControls from './ScientificControls';
import ScientificDepthControl from './ScientificDepthControl';
import ScientificColorbar from './ScientificColorbar';
import TimelineControl from './TimelineControl';
import PointQueryPanel from './PointQueryPanel';
import ArgoProfilePanel from './ArgoProfilePanel';
import ScientificTimelineChart from './ScientificTimelineChart';
import ModeSwitcher from '../mode/ModeSwitcher';
import { useApp } from '../../context/AppContext';

export default function ScientistExplorer({ selectedPoint, onPointClick, onClearPoint }) {
  const { selectedVariable, selectedDepth } = useApp();

  const [activePlatformId, setActivePlatformId] = useState(null);
  const [timelinePoint, setTimelinePoint] = useState(null);

  const handleSelectFloat = useCallback((platformId) => {
    setActivePlatformId(platformId);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 font-sans select-none">
      
      {/* 1. Underlying 3D Cesium Ocean Surface Globe & Map View */}
      <MapView
        onSelectFloatForProfile={handleSelectFloat}
        onPointClick={onPointClick}
        selectedPoint={selectedPoint}
        hideSidebar={true}
      />

      {/* 2. Top Floating Navigation & Mode Switcher */}
      <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none">
        
        {/* Left: Scientific Brand Badge */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl">
            <div className="p-1.5 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30">
              <Microscope size={16} />
            </div>
            <div>
              <div className="text-xs font-black text-white tracking-wide flex items-center gap-1.5">
                <span>oceanStream</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-500 text-white font-mono font-bold">
                  SCIENTIST
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                <span className="text-violet-300 font-semibold uppercase">{selectedVariable}</span>
                <span>·</span>
                <span className="text-cyan-300">{selectedDepth || 0}m depth</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Mode Switcher */}
        <div className="pointer-events-auto">
          <ModeSwitcher />
        </div>

        {/* Right: Telemetry & Ingestion Badges */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-900/95 border border-slate-700/80 text-[11px] font-mono shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>CMEMS ANFC</span>
            </div>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-1 text-cyan-400">
              <Radio size={11} />
              <span>Argo GDAC</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Left Controls: Scientific Variables, Layers & Engine */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, type: 'spring', bounce: 0, delay: 0.1 }}
        className="absolute top-20 left-4 z-30 pointer-events-auto hidden md:block"
      >
        <ScientificControls />
      </motion.div>

      {/* 4. Right Controls: Depth Slices & Scientific Colorbar */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, type: 'spring', bounce: 0, delay: 0.15 }}
        className="absolute top-20 right-4 z-30 flex flex-col gap-3 pointer-events-auto hidden md:flex"
      >
        <ScientificDepthControl />
        <ScientificColorbar />
      </motion.div>

      {/* 5. Bottom Timeline Animation & Date Scrubber */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, type: 'spring', bounce: 0, delay: 0.2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto hidden sm:block"
      >
        <TimelineControl />
      </motion.div>

      {/* 6. Point Query Inspector Panel */}
      <AnimatePresence>
        {selectedPoint && (
          <PointQueryPanel
            point={selectedPoint}
            onClose={onClearPoint}
            onOpenProfile={(id) => setActivePlatformId(id)}
            onOpenTimeline={(pt) => setTimelinePoint(pt)}
          />
        )}
      </AnimatePresence>

      {/* 7. Argo Float Profile Modal */}
      <AnimatePresence>
        {activePlatformId && (
          <ArgoProfilePanel
            platformNumber={activePlatformId}
            onClose={() => setActivePlatformId(null)}
          />
        )}
      </AnimatePresence>

      {/* Mobile Drawer Toggle (Visible only on very small screens) */}
      <div className="absolute bottom-6 left-4 right-4 z-30 flex justify-between gap-2 md:hidden pointer-events-auto">
        <button className="flex-1 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-xl backdrop-blur-xl text-xs font-bold text-slate-300 flex items-center justify-center gap-2" onClick={() => document.getElementById('mobile-workbench').classList.toggle('hidden')}>
          <Layers size={14} className="text-cyan-400" />
          Workbench
        </button>
        <button className="flex-1 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-xl backdrop-blur-xl text-xs font-bold text-slate-300 flex items-center justify-center gap-2" onClick={() => document.getElementById('mobile-depth').classList.toggle('hidden')}>
          <Activity size={14} className="text-rose-400" />
          Depth & Color
        </button>
      </div>

      {/* Mobile Wrappers */}
      <div id="mobile-workbench" className="absolute top-20 left-4 right-4 bottom-20 z-40 hidden md:hidden pointer-events-auto overflow-hidden">
        <ScientificControls />
      </div>
      <div id="mobile-depth" className="absolute top-20 left-4 right-4 bottom-20 z-40 hidden md:hidden pointer-events-auto overflow-hidden flex flex-col gap-3">
        <ScientificDepthControl />
        <ScientificColorbar />
      </div>

      {/* 8. Multi-Variable Timeline Series Modal */}
      <AnimatePresence>
        {timelinePoint && (
          <ScientificTimelineChart
            point={timelinePoint}
            onClose={() => setTimelinePoint(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
