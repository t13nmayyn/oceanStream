import { motion } from 'framer-motion';
import { GraduationCap, Microscope, Sparkles, Compass } from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';

export default function ModeSwitcher({ className = '', compact = false }) {
  const { userMode } = useApp();
  const dispatch = useAppDispatch();

  const handleSelectMode = (mode) => {
    if (userMode === mode) return;
    dispatch({ type: 'SET_USER_MODE', payload: mode });
    dispatch({
      type: 'ADD_TOAST',
      payload: {
        msg: mode === 'student' ? 'Switched to 🎓 Student / Exhibition Mode' : 'Switched to 🔬 Scientist / Research Mode',
        variant: 'info',
      },
    });
  };

  return (
    <div
      className={`inline-flex items-center p-1 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md relative ${className}`}
      role="radiogroup"
      aria-label="Ocean Explorer Mode"
      style={{
        boxShadow: userMode === 'student' 
          ? '0 0 20px rgba(0, 200, 255, 0.25), inset 0 1px 1px rgba(255,255,255,0.1)'
          : '0 0 20px rgba(123, 90, 245, 0.25), inset 0 1px 1px rgba(255,255,255,0.1)',
        transition: 'box-shadow 0.3s ease',
      }}
    >
      {/* Student Mode Button */}
      <button
        type="button"
        role="radio"
        aria-checked={userMode === 'student'}
        onClick={() => handleSelectMode('student')}
        className={`relative z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer select-none ${
          userMode === 'student'
            ? 'text-cyan-200 shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <GraduationCap size={compact ? 13 : 15} className={userMode === 'student' ? 'text-cyan-400 animate-pulse' : ''} />
        <span>{compact ? 'Student' : 'Student / Exhibition'}</span>
        {userMode === 'student' && !compact && (
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00c8ff]" />
        )}
      </button>

      {/* Scientist Mode Button */}
      <button
        type="button"
        role="radio"
        aria-checked={userMode === 'scientist'}
        onClick={() => handleSelectMode('scientist')}
        className={`relative z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer select-none ${
          userMode === 'scientist'
            ? 'text-violet-200 shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Microscope size={compact ? 13 : 15} className={userMode === 'scientist' ? 'text-violet-400 animate-pulse' : ''} />
        <span>{compact ? 'Scientist' : 'Scientist / Advanced'}</span>
        {userMode === 'scientist' && !compact && (
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_#7b5af5]" />
        )}
      </button>

      {/* Sliding Active Pill */}
      <motion.div
        className="absolute top-1 bottom-1 rounded-lg z-0 pointer-events-none"
        layoutId="activeModePill"
        style={{
          background: userMode === 'student'
            ? 'linear-gradient(135deg, rgba(0, 200, 255, 0.25) 0%, rgba(14, 116, 144, 0.4) 100%)'
            : 'linear-gradient(135deg, rgba(123, 90, 245, 0.3) 0%, rgba(88, 28, 135, 0.45) 100%)',
          border: userMode === 'student'
            ? '1px solid rgba(0, 200, 255, 0.5)'
            : '1px solid rgba(123, 90, 245, 0.6)',
          left: userMode === 'student' ? '4px' : '50%',
          right: userMode === 'student' ? '50%' : '4px',
        }}
        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
      />
    </div>
  );
}
