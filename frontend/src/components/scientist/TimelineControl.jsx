import { useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp, useAppDispatch } from '../../context/AppContext';

export default function TimelineControl() {
  const { selectedDate, isPlayingTime, playbackSpeed, serverDateInfo } = useApp();
  const dispatch = useAppDispatch();
  const intervalRef = useRef(null);

  const handleTogglePlay = () => {
    dispatch({ type: 'SET_PLAYING_TIME', payload: !isPlayingTime });
  };

  const stepDate = (days) => {
    const current = new Date(selectedDate || new Date());
    current.setDate(current.getDate() + days);
    const dateStr = current.toISOString().slice(0, 10);
    dispatch({ type: 'SET_DATE', payload: dateStr });
  };

  // Playback timer loop
  useEffect(() => {
    if (isPlayingTime) {
      const ms = 1500 / playbackSpeed;
      intervalRef.current = setInterval(() => {
        const current = new Date(selectedDate || new Date());
        current.setDate(current.getDate() + 1);
        const today = new Date();
        // Loop back if passed today
        if (current > today) {
          current.setDate(current.getDate() - 30);
        }
        dispatch({ type: 'SET_DATE', payload: current.toISOString().slice(0, 10) });
      }, ms);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlayingTime, playbackSpeed, selectedDate, dispatch]);

  const handlePreset = (preset) => {
    const now = new Date();
    let target = new Date();
    if (preset === 'today') target = new Date(now - 86400000); // Copernicus yesterday
    else if (preset === '7d') target = new Date(now - 7 * 86400000);
    else if (preset === '30d') target = new Date(now - 30 * 86400000);
    else if (preset === '1y') target = new Date(now - 365 * 86400000);

    dispatch({ type: 'SET_DATE', payload: target.toISOString().slice(0, 10) });
  };

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-950/95 border border-slate-700/60 shadow-[0_16px_48px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl text-slate-100 select-none font-sans ring-1 ring-white/5">
      
      {/* 1. Play / Pause Instrument Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        type="button"
        onClick={handleTogglePlay}
        className={`p-2.5 rounded-xl transition-all duration-200 shadow-md cursor-pointer flex items-center justify-center shrink-0 ${
          isPlayingTime
            ? 'bg-amber-500 text-slate-950 font-bold shadow-[0_0_16px_rgba(245,158,11,0.4)]'
            : 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_16px_rgba(6,182,212,0.35)] hover:bg-cyan-400'
        }`}
        title={isPlayingTime ? 'Pause 4D Temporal Loop' : 'Play 4D Temporal Loop'}
      >
        {isPlayingTime ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </motion.button>

      {/* 2. Step Backward / Forward */}
      <div className="flex items-center gap-1 shrink-0">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={() => stepDate(-1)}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:bg-slate-850 hover:border-slate-700 transition-colors cursor-pointer"
          title="Previous day (-1d)"
        >
          <SkipBack size={13} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          type="button"
          onClick={() => stepDate(1)}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:bg-slate-850 hover:border-slate-700 transition-colors cursor-pointer"
          title="Next day (+1d)"
        >
          <SkipForward size={13} />
        </motion.button>
      </div>

      {/* 3. Interactive Temporal Display & Date Picker */}
      <div className="relative flex flex-col justify-center px-3 py-1 rounded-xl bg-slate-900/90 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)] group hover:border-cyan-500/40 transition-colors min-w-[140px]">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-[9px] font-bold font-mono tracking-wider uppercase ${isPlayingTime ? 'text-amber-400 animate-pulse' : 'text-cyan-400'}`}>
            {isPlayingTime ? 'Playback Active' : 'Active Date'}
          </span>
          <Calendar size={11} className={isPlayingTime ? 'text-amber-500/80' : 'text-cyan-500/80'} />
        </div>
        <div className="text-[13px] font-mono font-bold text-white tracking-wide leading-tight">
          {selectedDate || 'Select Date'}
        </div>
        {serverDateInfo?.copernicus_available_date && (
          <div className="text-[8px] font-mono text-slate-400 mt-0.5 tracking-tight truncate">
            Latest dataset: {serverDateInfo.copernicus_available_date}
          </div>
        )}
        {/* Invisible full overlay input to invoke date picker on click */}
        <input
          type="date"
          value={selectedDate || ''}
          onChange={(e) => dispatch({ type: 'SET_DATE', payload: e.target.value })}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          title="Select active temporal state"
        />
      </div>

      {/* 4. Quick Jump Presets */}
      <div className="flex items-center gap-1 shrink-0">
        {[
          { label: 'Latest', key: 'today' },
          { label: '-7d', key: '7d' },
          { label: '-30d', key: '30d' },
          { label: '-1yr', key: '1y' },
        ].map((p) => (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            key={p.key}
            type="button"
            onClick={() => handlePreset(p.key)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-slate-900/70 text-slate-300 hover:text-cyan-300 hover:bg-slate-850 border border-slate-800/80 hover:border-slate-700 transition-colors cursor-pointer"
          >
            {p.label}
          </motion.button>
        ))}
      </div>

      {/* 5. Playback Speed Controller */}
      <div className="flex items-center gap-1 pl-2.5 border-l border-slate-800 shrink-0">
        <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-900/90 border border-slate-800">
          {[1, 2, 5].map((spd) => {
            const isCurrent = playbackSpeed === spd;
            return (
              <button
                key={spd}
                type="button"
                onClick={() => dispatch({ type: 'SET_PLAYBACK_SPEED', payload: spd })}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all duration-150 cursor-pointer ${
                  isCurrent
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Playback speed ${spd}x`}
              >
                {spd}x
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
