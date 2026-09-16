import { motion } from 'framer-motion';
import { Bot, Radio, Compass, X, ArrowRight } from 'lucide-react';

export default function StudentObservationCard({ marker, onClose }) {
  if (!marker) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 15 }}
      className="absolute bottom-6 right-6 w-96 p-4 rounded-2xl bg-slate-900/95 border border-cyan-500/50 shadow-2xl backdrop-blur-2xl text-slate-100 z-50 select-none"
    >
      <div className="flex items-start justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Bot size={20} />
          </div>
          <div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              {marker.type}
            </span>
            <h3 className="text-sm font-bold text-white mt-1">
              {marker.name}
            </h3>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      <div className="py-3 space-y-2.5 text-xs">
        <p className="text-slate-300 leading-relaxed">
          {marker.desc}
        </p>

        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Operating Depth</div>
            <div className="text-xs font-bold text-cyan-300 font-mono">{marker.depth}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Status</div>
            <div className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Active Transmitting
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-200">
          💡 <strong>How it works:</strong> Every 10 days, this robotic float sinks to 2,000 meters, ascends to the surface recording water properties, and transmits everything to satellites before diving again!
        </div>
      </div>
    </motion.div>
  );
}
