import { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Calendar, Clock, FastForward } from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';

export default function TimelineControl() {
  const { selectedDate, isPlayingTime, playbackSpeed } = useApp();
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
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl text-slate-100 select-none font-sans">
      
      {/* Play / Pause */}
      <button
        onClick={handleTogglePlay}
        className={`p-2 rounded-xl transition-all shadow-md cursor-pointer ${
          isPlayingTime
            ? 'bg-amber-500 text-slate-950 font-bold'
            : 'bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400'
        }`}
        title={isPlayingTime ? 'Pause 4D animation' : 'Play 4D time animation'}
      >
        {isPlayingTime ? <Pause size={16} /> : <Play size={16} />}
      </button>

      {/* Step Buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => stepDate(-1)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
          title="Previous day (-1d)"
        >
          <SkipBack size={13} />
        </button>
        <button
          onClick={() => stepDate(1)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
          title="Next day (+1d)"
        >
          <SkipForward size={13} />
        </button>
      </div>

      {/* Date Input / Display */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
        <Calendar size={14} className="text-cyan-400" />
        <input
          type="date"
          value={selectedDate || ''}
          onChange={(e) => dispatch({ type: 'SET_DATE', payload: e.target.value })}
          className="bg-transparent text-xs font-mono font-bold text-white focus:outline-none cursor-pointer"
        />
      </div>

      {/* Quick Presets */}
      <div className="flex items-center gap-1">
        {[
          { label: 'Latest', key: 'today' },
          { label: '-7d', key: '7d' },
          { label: '-30d', key: '30d' },
          { label: '-1yr', key: '1y' },
        ].map((p) => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className="px-2 py-1 rounded-lg text-[10px] font-mono bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/50 transition-all cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Playback Speed */}
      <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
        {[1, 2, 5].map((spd) => (
          <button
            key={spd}
            onClick={() => dispatch({ type: 'SET_PLAYBACK_SPEED', payload: spd })}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
              playbackSpeed === spd
                ? 'bg-violet-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {spd}x
          </button>
        ))}
      </div>
    </div>
  );
}
