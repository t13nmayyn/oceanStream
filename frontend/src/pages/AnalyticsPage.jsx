import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useApiHealth } from '../hooks/useApiHealth';
import { useDateControls } from '../hooks/useDateControls';
import AppNav from '../components/navigation/AppNav';
import { API_BASE } from '../config/api';
import { useApp, useAppDispatch } from '../context/AppContext';
import { getCalculatedDates } from '../utils/dates';
import { BarChart3, RefreshCw, MapPin, Layers, Calendar, ChevronDown } from 'lucide-react';
import TimelineChart from '../components/timeline/TimelineChart';

function AnalyticsInner() {
  useApiHealth();
  useDateControls();

  const d = getCalculatedDates();
  const { serverDateInfo } = useApp();
  const dispatch = useAppDispatch();

  const [lat, setLat] = useState('13.08');
  const [lon, setLon] = useState('80.27');
  const [depth, setDepth] = useState('0');
  const [dateStart, setDateStart] = useState(d.weekAgo);
  const [dateEnd, setDateEnd] = useState(d.yesterday);
  const [granularity, setGranularity] = useState('day');
  const [chartData, setChartData] = useState({ labels: [], temps: [], salinities: [] });
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState(null);

  const setPreset = (preset) => {
    let end = serverDateInfo?.latest_available || d.yesterday;
    let start = d.weekAgo;
    if (preset === 'yesterday') start = end;
    else if (preset === '7d') start = serverDateInfo?.presets?.['7d']?.start || d.weekAgo;
    else if (preset === '30d') start = serverDateInfo?.presets?.['30d']?.start || d.monthAgo;
    else if (preset === '1y') start = serverDateInfo?.presets?.['1y']?.start || d.yearAgo;
    setDateStart(start);
    setDateEnd(end);
  };

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const url = `${API_BASE}/ocean/timeline?lat=${lat}&lon=${lon}&depth=${depth}&date_start=${dateStart}&date_end=${dateEnd}&granularity=${granularity}&variables=temperature,salinity`;
      const res = await fetch(url);
      const data = await res.json();
      const series = data.series || [];
      const labels = series.map((i) => i.date);
      const temps = series.map((i) => i.temperature_c ?? i.temperature);
      const salinities = series.map((i) => i.salinity_psu ?? i.salinity);
      setChartData({ labels, temps, salinities });
      setMeta({ count: series.length, source: series[0]?.source || data.source || 'backend response', dateStart, dateEnd, depth });
      dispatch({ type: 'ADD_TOAST', payload: { message: `Loaded ${series.length} timeline points`, type: 'success' } });
    } catch (err) {
      dispatch({ type: 'ADD_TOAST', payload: { message: `Timeline error: ${err.message}`, type: 'error' } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTimeline(); }, []); // eslint-disable-line

  const inputStyle = {
    background: 'rgba(17, 29, 53, 0.8)',
    border: '1px solid rgba(30, 48, 85, 0.7)',
    color: '#d4e3f7',
    colorScheme: 'dark',
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ paddingTop: '56px' }}>
      <div className="max-w-7xl mx-auto w-full px-6 py-8 flex flex-col gap-6 flex-1">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={18} style={{ color: '#00c8ff' }} />
              <h1
                className="text-[22px] font-bold text-white"
                style={{ fontFamily: 'Outfit, Inter, sans-serif' }}
              >
                Ocean Analytics
              </h1>
            </div>
            <p className="text-muted text-[13px]">
              Time-series analysis via{' '}
              <span className="font-mono text-accent">GET /ocean/timeline</span>
            </p>
          </div>

          <button
            onClick={fetchTimeline}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all disabled:opacity-50"
            style={{
              background: 'rgba(0, 200, 255, 0.1)',
              border: '1px solid rgba(0, 200, 255, 0.25)',
              color: '#00c8ff',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Fetching…' : 'Fetch Timeline'}
          </button>
        </div>

        {/* Controls card */}
        <div
          className="rounded-2xl p-5"
          style={{ background: 'rgba(13, 21, 37, 0.7)', border: '1px solid rgba(30, 48, 85, 0.6)' }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            {/* Lat */}
            <div>
              <label className="flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-muted mb-1.5">
                <MapPin size={10} /> Latitude
              </label>
              <input
                type="text"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg text-[12px] font-mono outline-none focus:border-accent transition-colors"
                style={inputStyle}
              />
            </div>

            {/* Lon */}
            <div>
              <label className="text-[10px] font-semibold tracking-wider uppercase text-muted mb-1.5 block">Longitude</label>
              <input
                type="text"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg text-[12px] font-mono outline-none focus:border-accent transition-colors"
                style={inputStyle}
              />
            </div>

            {/* Depth */}
            <div>
              <label className="flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-muted mb-1.5">
                <Layers size={10} /> Depth (m)
              </label>
              <input
                type="number"
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                min="0" max="5000"
                className="w-full px-2.5 py-2 rounded-lg text-[12px] font-mono outline-none focus:border-accent transition-colors"
                style={inputStyle}
              />
            </div>

            {/* Date start */}
            <div>
              <label className="flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-muted mb-1.5">
                <Calendar size={10} /> Start
              </label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg text-[12px] font-mono outline-none focus:border-accent transition-colors"
                style={inputStyle}
              />
            </div>

            {/* Date end */}
            <div>
              <label className="text-[10px] font-semibold tracking-wider uppercase text-muted mb-1.5 block">End</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg text-[12px] font-mono outline-none focus:border-accent transition-colors"
                style={inputStyle}
              />
            </div>

            {/* Granularity */}
            <div>
              <label className="text-[10px] font-semibold tracking-wider uppercase text-muted mb-1.5 block">Granularity</label>
              <div className="relative">
                <select
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-[12px] font-mono outline-none appearance-none"
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted" />
              </div>
            </div>
          </div>

          {/* Presets */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="text-[11px] text-muted">Quick range:</span>
            {[['yesterday', 'Yesterday'], ['7d', 'Last 7 Days'], ['30d', 'Last 30 Days'], ['1y', 'Last Year']].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setPreset(k)}
                className="text-[11px] px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                style={{
                  background: 'rgba(17, 29, 53, 0.8)',
                  border: '1px solid rgba(30, 48, 85, 0.5)',
                  color: 'rgba(107, 131, 166, 0.8)',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div
          className="rounded-2xl flex-1 flex flex-col overflow-hidden"
          style={{ background: 'rgba(13, 21, 37, 0.7)', border: '1px solid rgba(30, 48, 85, 0.6)', minHeight: '380px' }}
        >
          {/* Chart header */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: '1px solid rgba(30, 48, 85, 0.5)' }}
          >
            <div>
              <span className="text-[13px] font-semibold text-white">Temperature & Salinity</span>
              {meta && (
                <span className="ml-3 text-[11px] font-mono text-muted">
                  {lat}°, {lon}° · {meta.depth}m · {meta.count} data points
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <div className="w-3 h-0.5 rounded" style={{ background: '#f54375' }} />
                Temperature
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <div className="w-3 h-0.5 rounded" style={{ background: '#00c8ff' }} />
                Salinity
              </div>
            </div>
          </div>

          <div className="flex-1 relative p-4">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div
                  className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'rgba(0,200,255,0.2)', borderTopColor: '#00c8ff' }}
                />
                <span className="text-[12px] text-muted">Loading ocean analytics…</span>
              </div>
            ) : chartData.labels.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-muted text-[13px]">No data. Click "Fetch Timeline" to load.</span>
              </div>
            ) : (
              <TimelineChart
                labels={chartData.labels}
                temps={chartData.temps}
                salinities={chartData.salinities}
              />
            )}
          </div>
        </div>

        {/* Metadata footer */}
        {meta && (
          <div className="flex flex-wrap gap-4 text-[11px] font-mono">
            {[
              { label: 'Location', value: `${lat}° N, ${lon}° E` },
              { label: 'Depth', value: `${meta.depth} m` },
              { label: 'Range', value: `${meta.dateStart} → ${meta.dateEnd}` },
              { label: 'Points', value: meta.count },
              { label: 'Source', value: meta.source },
              { label: 'Endpoint', value: '/ocean/timeline' },
            ].map((m) => (
              <div key={m.label} className="flex items-center gap-1.5">
                <span style={{ color: 'rgba(107, 131, 166, 0.5)' }}>{m.label}:</span>
                <span style={{ color: 'rgba(107, 131, 166, 0.9)' }}>{m.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  useEffect(() => {
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen"
      style={{ background: '#06090f' }}
    >
      <AppNav />
      <AnalyticsInner />
    </motion.div>
  );
}
