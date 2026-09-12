import { useEffect, useRef } from 'react';
import { THERMAL_RAMP_COLORS } from '../../utils/oceanThermalField';
import { useApp } from '../../context/AppContext';

export default function Colorbar() {
  const canvasRef = useRef(null);
  const { showThermalHeatmap, showStreamlines } = useApp();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 220;
    canvas.height = 12;

    const grad = ctx.createLinearGradient(0, 0, 220, 0);
    const n = THERMAL_RAMP_COLORS.length;
    THERMAL_RAMP_COLORS.forEach((hex, idx) => {
      grad.addColorStop(idx / (n - 1), hex);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 220, 12);
  }, []);

  return (
    <div className="absolute bottom-5 right-5 bg-surface/90 border border-border rounded-xl p-3 z-40 text-xs min-w-[240px] backdrop-blur-md shadow-2xl animate-fade-in">
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-bold text-white text-xs flex items-center gap-1.5">
          <span>🌡️</span> Sea Surface Temperature (SST)
        </span>
        <span className="text-[0.65rem] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">
          °C
        </span>
      </div>

      <canvas ref={canvasRef} className="w-full h-3 rounded-sm shadow-inner" />

      <div className="flex justify-between text-muted font-mono text-[0.65rem] mt-1.5 font-semibold">
        <span className="text-[#00b4d8]">0°C</span>
        <span className="text-[#00f5a0]">12°C</span>
        <span className="text-[#ffd600]">22°C</span>
        <span className="text-[#ff6d00]">28°C</span>
        <span className="text-[#ff1744]">32°C</span>
      </div>

      <div className="flex items-center justify-between text-[0.65rem] text-muted border-t border-border/50 pt-2 mt-2">
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${showThermalHeatmap ? 'bg-green' : 'bg-muted'}`} />
          SST Thermal Layer
        </span>
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${showStreamlines ? 'bg-accent animate-pulse' : 'bg-muted'}`} />
          Current Flow Gyres
        </span>
      </div>
    </div>
  );
}
