export default function ZoomControls({ onZoomIn, onZoomOut, onReset, onNorth, onPitch }) {
  return (
    <div className="absolute top-16 left-3.5 z-50 flex flex-col gap-1 bg-surface/90 border border-border p-1 rounded-lg backdrop-blur-md shadow-2xl">
      <button
        onClick={onZoomIn}
        title="Zoom In"
        className="w-8 h-8 rounded border border-border bg-surface-2 text-text text-sm font-bold flex items-center justify-center hover:bg-accent hover:text-black hover:border-accent cursor-pointer transition-colors"
      >
        ➕
      </button>
      <button
        onClick={onZoomOut}
        title="Zoom Out"
        className="w-8 h-8 rounded border border-border bg-surface-2 text-text text-sm font-bold flex items-center justify-center hover:bg-accent hover:text-black hover:border-accent cursor-pointer transition-colors"
      >
        ➖
      </button>
      <button
        onClick={onReset}
        title="Reset View (Indian Ocean)"
        className="w-8 h-8 rounded border border-border bg-surface-2 text-text text-sm font-bold flex items-center justify-center hover:bg-accent hover:text-black hover:border-accent cursor-pointer transition-colors"
      >
        🎯
      </button>
      <button
        onClick={onNorth}
        title="North Align"
        className="w-8 h-8 rounded border border-border bg-surface-2 text-text text-sm font-bold flex items-center justify-center hover:bg-accent hover:text-black hover:border-accent cursor-pointer transition-colors"
      >
        🧭
      </button>
      <button
        onClick={onPitch}
        title="Toggle 3D Perspective Pitch"
        className="w-8 h-8 rounded border border-border bg-surface-2 text-text text-sm font-bold flex items-center justify-center hover:bg-accent hover:text-black hover:border-accent cursor-pointer transition-colors"
      >
        📐
      </button>
    </div>
  );
}
