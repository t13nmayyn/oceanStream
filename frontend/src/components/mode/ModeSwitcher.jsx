import { motion } from 'framer-motion';
import { GraduationCap, Microscope } from 'lucide-react';
import { useApp, useAppDispatch } from '../../context/AppContext';

export default function ModeSwitcher({ className = '', compact = false }) {
  const { userMode } = useApp();
  const dispatch = useAppDispatch();

  const handleSelectMode = (mode) => {
    if (userMode === mode) return;

    dispatch({
      type: 'SET_USER_MODE',
      payload: mode,
    });

    dispatch({
      type: 'ADD_TOAST',
      payload: {
        msg:
          mode === 'student'
            ? 'Switched to 🎓 Student Mode'
            : 'Switched to 🔬 Scientist Mode',
        variant: 'info',
      },
    });
  };

  const isStudent = userMode === 'student';
  const isScientist = userMode === 'scientist';

  const buttonBase = `
    group relative flex items-center gap-2
    rounded-xl
    px-3 py-2
    text-[12px] font-medium
    tracking-tight
    transition-all duration-200
    select-none
    cursor-pointer
    outline-none
  `;

  return (
    <div
      role="radiogroup"
      aria-label="OceanStream Explorer Mode"
      className={`
        relative inline-flex items-center
        rounded-[16px]
        border border-slate-700/70
        bg-[#07111f]/90
        p-1
        backdrop-blur-2xl
        shadow-[0_8px_28px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)]
        ring-1 ring-white/[0.035]
        ${className}
      `}
    >
      {/* subtle top highlight */}
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* STUDENT */}
      <button
        type="button"
        role="radio"
        aria-checked={isStudent}
        onClick={() => handleSelectMode('student')}
        className={`${buttonBase} ${
          isStudent
            ? 'text-white'
            : 'text-slate-500 hover:text-slate-200'
        }`}
      >
        {isStudent && (
          <motion.div
            layoutId="mode-active-background"
            transition={{
              type: 'spring',
              stiffness: 450,
              damping: 32,
              mass: 0.7,
            }}
            className="absolute inset-0 -z-10 overflow-hidden rounded-xl"
          >
            {/* elevated surface */}
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-400/[0.13] via-slate-900/95 to-slate-950/95" />

            {/* border */}
            <div className="absolute inset-0 rounded-xl border border-cyan-300/25" />

            {/* bottom accent */}
            <div className="absolute inset-x-3 bottom-0 h-[1.5px] rounded-full bg-cyan-300/80 shadow-[0_0_10px_rgba(34,211,238,0.55)]" />

            {/* ambient glow */}
            <div className="absolute -left-3 -top-3 h-10 w-10 rounded-full bg-cyan-400/10 blur-xl" />
          </motion.div>
        )}

        {/* icon well */}
        <span
          className={`
            flex h-6 w-6 items-center justify-center
            rounded-lg
            border
            transition-all duration-200
            ${
              isStudent
                ? 'border-cyan-300/20 bg-cyan-300/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                : 'border-transparent bg-white/[0.025] group-hover:border-white/[0.06]'
            }
          `}
        >
          <GraduationCap
            size={14}
            strokeWidth={2}
            className={`transition-colors duration-200 ${
              isStudent ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-300'
            }`}
          />
        </span>

        <span className="relative">
          {compact ? 'Student' : 'Student Mode'}
        </span>
      </button>

      {/* divider */}
      <div className="mx-0.5 h-5 w-px bg-gradient-to-b from-transparent via-slate-700/80 to-transparent" />

      {/* SCIENTIST */}
      <button
        type="button"
        role="radio"
        aria-checked={isScientist}
        onClick={() => handleSelectMode('scientist')}
        className={`${buttonBase} ${
          isScientist
            ? 'text-white'
            : 'text-slate-500 hover:text-slate-200'
        }`}
      >
        {isScientist && (
          <motion.div
            layoutId="mode-active-background"
            transition={{
              type: 'spring',
              stiffness: 450,
              damping: 32,
              mass: 0.7,
            }}
            className="absolute inset-0 -z-10 overflow-hidden rounded-xl"
          >
            {/* elevated surface */}
            <div className="absolute inset-0 bg-gradient-to-b from-violet-400/[0.14] via-slate-900/95 to-slate-950/95" />

            {/* border */}
            <div className="absolute inset-0 rounded-xl border border-violet-300/25" />

            {/* bottom accent */}
            <div className="absolute inset-x-3 bottom-0 h-[1.5px] rounded-full bg-violet-300/85 shadow-[0_0_10px_rgba(167,139,250,0.55)]" />

            {/* ambient glow */}
            <div className="absolute -right-3 -top-3 h-10 w-10 rounded-full bg-violet-400/10 blur-xl" />
          </motion.div>
        )}

        {/* icon well */}
        <span
          className={`
            flex h-6 w-6 items-center justify-center
            rounded-lg
            border
            transition-all duration-200
            ${
              isScientist
                ? 'border-violet-300/20 bg-violet-300/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                : 'border-transparent bg-white/[0.025] group-hover:border-white/[0.06]'
            }
          `}
        >
          <Microscope
            size={14}
            strokeWidth={2}
            className={`transition-colors duration-200 ${
              isScientist
                ? 'text-violet-300'
                : 'text-slate-500 group-hover:text-slate-300'
            }`}
          />
        </span>

        <span className="relative">
          {compact ? 'Scientist' : 'Scientist Mode'}
        </span>
      </button>
    </div>
  );
}