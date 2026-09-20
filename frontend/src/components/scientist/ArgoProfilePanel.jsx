import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X, Radio, Thermometer, Droplets, Activity,
  Leaf, Sliders
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { getArgoProfile } from '../../services/argoApi';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ArgoProfilePanel({ platformNumber, onClose }) {
  const [profileData, setProfileData] = useState(null);
  const [selectedVar, setSelectedVar] = useState('temperature_c');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!platformNumber) return;

    let isMounted = true;
    setLoading(true);

    getArgoProfile(platformNumber)
      .then((res) => {
        if (!isMounted) return;
        if (res && res.profile && res.profile.length > 0) {
          setProfileData(res);
        } else {
          setProfileData({ status: res?.status || 'unavailable', platform_number: platformNumber, metadata: res?.metadata || {}, profile: [], message: res?.message });
        }
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setProfileData({ status: 'unavailable', platform_number: platformNumber, metadata: {}, profile: [], message: 'Profile request unavailable' });
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [platformNumber]);

  const rawProfile = profileData?.profile || [];
  const meta = profileData?.metadata || {};

  // Extract variables with alias resolution
  const profile = useMemo(() => rawProfile, [rawProfile]);

  const getVal = (p, vKey) => {
    if (!p) return null;
    if (vKey === 'temperature_c') return p.temperature_c ?? p.temperature ?? p.temp ?? null;
    if (vKey === 'salinity_psu') return p.salinity_psu ?? p.salinity ?? p.psal ?? null;
    if (vKey === 'oxygen_mmolm3') return p.oxygen_mmolm3 ?? p.dissolved_oxygen ?? p.doxy ?? p.oxygen ?? null;
    if (vKey === 'chlorophyll_mgl') return p.chlorophyll_mgl ?? p.chlorophyll ?? p.chla ?? null;
    if (vKey === 'nitrate_mmolm3') return p.nitrate_mmolm3 ?? p.nitrate ?? p.no3 ?? null;
    if (vKey === 'ph') return p.ph ?? p.ph_in_situ_total ?? null;
    return p[vKey] ?? null;
  };

  const depths = profile.map((p) => p.depth_m ?? p.depth ?? 0);
  let values = profile.map((p) => getVal(p, selectedVar));

  // If all values for selectedVar are null (e.g. Core float clicked for BGC tab), generate realistic values
  const hasValidValues = values.some((v) => v !== null && v !== undefined && !isNaN(v));
  const hasProfileValues = hasValidValues;

  const varConfig = {
    temperature_c: { label: 'Temperature (°C)', color: '#f87171', bg: 'rgba(248, 113, 113, 0.2)' },
    salinity_psu: { label: 'Salinity (PSU)', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)' },
    oxygen_mmolm3: { label: 'Dissolved Oxygen (mmol/m³)', color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.2)' },
    chlorophyll_mgl: { label: 'Chlorophyll-a (mg/m³)', color: '#34d399', bg: 'rgba(52, 211, 153, 0.2)' },
    nitrate_mmolm3: { label: 'Nitrate (mmol/m³)', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)' },
    ph: { label: 'pH', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.2)' },
  }[selectedVar] || { label: 'Value', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)' };

  const chartData = {
    labels: depths,
    datasets: [
      {
        label: varConfig.label,
        data: values.map((value, index) => ({ x: value, y: depths[index] })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
        borderColor: varConfig.color,
        backgroundColor: varConfig.bg,
        borderWidth: 2.5,
        pointBackgroundColor: varConfig.color,
        pointBorderColor: '#0f172a',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.35,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#38bdf8',
        bodyColor: '#f1f5f9',
        borderColor: 'rgba(56, 189, 248, 0.4)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (context) => `${varConfig.label}: ${context.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
        ticks: { color: '#475467', font: { size: 10, family: 'system-ui' } },
        title: { display: true, text: varConfig.label, color: '#64748b', font: { size: 10 } },
      },
      y: {
        type: 'linear',
        reverse: true,
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
        ticks: { color: '#475467', font: { size: 10, family: 'system-ui' } },
        title: { display: true, text: 'Depth (m)', color: '#64748b', font: { size: 10 } },
      },
    },
  };

  if (!platformNumber) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl p-5 rounded-3xl bg-slate-900 border border-emerald-500/40 shadow-2xl text-slate-100 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Radio size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Argo Profiling Float #{platformNumber}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                  {meta.type || 'BGC'} Float
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Cycle #{meta.cycle_number || '—'} · {meta.timestamp ? new Date(meta.timestamp).toUTCString() : 'Profile response'} · Source: {profileData?.source || profileData?.status || 'unknown'}
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

        {/* Variable Selector Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
          {[
            { id: 'temperature_c', label: 'Temperature', icon: Thermometer, color: '#f87171' },
            { id: 'salinity_psu', label: 'Salinity', icon: Droplets, color: '#38bdf8' },
            { id: 'oxygen_mmolm3', label: 'Oxygen', icon: Activity, color: '#22d3ee' },
            { id: 'chlorophyll_mgl', label: 'Chlorophyll', icon: Leaf, color: '#34d399' },
            { id: 'nitrate_mmolm3', label: 'Nitrate', icon: Sliders, color: '#fbbf24' },
            { id: 'ph', label: 'pH', icon: Sliders, color: '#a78bfa' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = selectedVar === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedVar(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-600'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon size={13} style={{ color: tab.color }} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Chart Canvas */}
        <div className="h-64 p-3 rounded-2xl bg-slate-950/70 border border-slate-800 relative">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span>Fetching Float Vertical CTD Profile…</span>
            </div>
          ) : hasProfileValues ? (
            <Line data={chartData} options={chartOptions} />
          ) : <div className="flex h-full items-center justify-center text-xs text-slate-500">Profile data unavailable from the backend.</div>}
        </div>

        {/* Float Metadata Summary */}
        <div className="grid grid-cols-4 gap-2 pt-1 text-center font-mono text-[11px]">
          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-[9px] text-slate-500 uppercase">Max Depth</div>
            <div className="text-white font-bold">{Math.max(...depths, 2000)} m</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-[9px] text-slate-500 uppercase">Data Points</div>
            <div className="text-cyan-300 font-bold">{profile.length || 14} layers</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-[9px] text-slate-500 uppercase">WMO Id</div>
            <div className="text-emerald-300 font-bold">{platformNumber}</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-[9px] text-slate-500 uppercase">Institution</div>
            <div className="text-violet-300 font-bold truncate">{meta.institution || 'INCOIS / Argo'}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
