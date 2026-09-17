import { Plus, Minus, Crosshair, Compass, Layers } from 'lucide-react';

export default function ZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onNorth,
  onPitch,
  className = '',
}) {
  const buttonClass =
    'w-9 h-9 rounded-xl bg-slate-900/85 border border-slate-700/70 text-slate-200 hover:text-cyan-300 hover:bg-slate-800 hover:border-cyan-400/30 flex items-center justify-center transition-all duration-200 cursor-pointer shadow-sm active:scale-95';

  return (
    <div
      className={`
        absolute
        bottom-6
        left-6
        z-40
        flex
        flex-col
        gap-1
        p-1.5
        rounded-2xl
        bg-slate-950/90
        border
        border-slate-700/70
        shadow-[0_12px_36px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)]
        backdrop-blur-xl
        ring-1
        ring-white/5
        select-none
        ${className}
      `}
    >
      {/* Zoom In */}
      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom In"
        aria-label="Zoom In"
        className={buttonClass}
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>

      {/* Zoom Out */}
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom Out"
        aria-label="Zoom Out"
        className={buttonClass}
      >
        <Minus size={16} strokeWidth={2.5} />
      </button>

      {/* Divider */}
      <div className="w-5 h-px bg-slate-700/80 mx-auto my-1" />

      {/* Reset Focus */}
      <button
        type="button"
        onClick={onReset}
        title="Reset Focus (Indian Ocean Basin)"
        aria-label="Reset Focus"
        className={buttonClass}
      >
        <Crosshair size={15} />
      </button>

      {/* Align North */}
      <button
        type="button"
        onClick={onNorth}
        title="Align True North"
        aria-label="Align True North"
        className={buttonClass}
      >
        <Compass size={15} />
      </button>

      {/* 3D Perspective Pitch */}
      <button
        type="button"
        onClick={onPitch}
        title="Toggle 3D Perspective Pitch"
        aria-label="Toggle 3D Perspective Pitch"
        className={buttonClass}
      >
        <Layers size={15} />
      </button>
    </div>
  );
}