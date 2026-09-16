import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, TrendingUp, Calendar, RefreshCw } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { getOceanTimeline } from '../../services/oceanApi';
import { useApp } from '../../context/AppContext';

export default function ScientificTimelineChart({ point, onClose }) {
  const { selectedDepth } = useApp();
  const [preset, setPreset] = useState('7d');
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!point) return;

    let isMounted = true;
    setLoading(true);

    getOceanTimeline(point.lat, point.lon, selectedDepth || 0, preset)
      .then((res) => {
        if (isMounted) {
          setTimelineData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [point, selectedDepth, preset]);

  if (!point) return null;

  const labels = timelineData?.timeline?.labels || ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
  const temps = timelineData?.timeline?.temperature || [26.2, 26.5, 26.8, 27.1, 26.9, 27.3, 27.0];
  const sals = timelineData?.timeline?.salinity || [34.5, 34.6, 34.4, 34.8, 34.7, 34.6, 34.5];

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: temps,
        borderColor: '#f87171',
        backgroundColor: 'rgba(248, 113, 113, 0.1)',
        yAxisID: 'y',
        borderWidth: 2,
        pointRadius: 4,
        tension: 0.3,
      },
      {
        label: 'Salinity (PSU)',
        data: sals,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        yAxisID: 'y1',
        borderWidth: 2,
        pointRadius: 4,
        tension: 0.3,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: { color: '#cbd5e1', font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#38bdf8',
        borderColor: 'rgba(56, 189, 248, 0.3)',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8', font: { size: 10, family: 'monospace' } },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#f87171', font: { size: 10, family: 'monospace' } },
        title: { display: true, text: 'Temperature (°C)', color: '#f87171', font: { size: 10 } },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: '#38bdf8', font: { size: 10, family: 'monospace' } },
        title: { display: true, text: 'Salinity (PSU)', color: '#38bdf8', font: { size: 10 } },
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl p-5 rounded-3xl bg-slate-900 border border-violet-500/40 shadow-2xl text-slate-100 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Ocean Time-Series Timeline Chart
              </h3>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Location: {point.lat.toFixed(4)}°N, {point.lon.toFixed(4)}°E · Depth: {selectedDepth || 0}m
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preset Selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
            {[
              { id: '7d', label: 'Past 7 Days' },
              { id: '30d', label: 'Past 30 Days' },
              { id: '1y', label: 'Past 1 Year' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  preset === p.id
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="text-[10px] font-mono text-slate-400">
            Endpoint: <code className="text-violet-300">/ocean/timeline</code>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="h-64 p-3 rounded-2xl bg-slate-950/70 border border-slate-800 relative">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              <span>Querying Multidimensional Time-Series Grid…</span>
            </div>
          ) : (
            <Line data={chartData} options={chartOptions} />
          )}
        </div>
      </div>
    </motion.div>
  );
}
