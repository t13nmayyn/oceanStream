/**
 * TimelineAnalysisSection — Phase 3B
 *
 * Embedded timeline chart section for the OceanIntelligencePanel right panel.
 * Renders two tab groups:
 *   1. Physics    — Temperature & Salinity over time
 *   2. BGC        — Chlorophyll, Oxygen, pH, Nitrate over time
 *
 * Design rules:
 *   - White/navy palette to match OceanIntelligencePanel
 *   - Chart.js Line charts via react-chartjs-2 (already registered globally
 *     in TimelineChart.jsx — we import the global registration here too to
 *     be safe in case this renders before TimelineChart mounts)
 *   - Only shows series where real data exists (no zero-substitution)
 *   - Loading: previous chart stays visible with opacity overlay
 *   - Error: compact red alert, no chart flash
 *   - Range tabs: 7d / 30d / 90d / 1yr (one request per selection)
 */
import { useState, useMemo } from 'react';
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
import { TrendingUp, AlertTriangle, Info } from 'lucide-react';
import useTimelineData, { SUPPORTED_PRESETS } from '../../hooks/useTimelineData';
import { useApp } from '../../context/AppContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ─── helpers ──────────────────────────────────────────────────────────────────

const hasValue = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/**
 * Extract a named series from the raw timeline response.
 * Handles both response shapes the backend may return:
 *   shape A: data.series = [{ date, temperature_c, salinity_psu, ... }]
 *   shape B: data.timeline = { labels: [...], temperature: [...], ... }
 *
 * Returns null if the field is absent or all-null across the series.
 */
function extractSeries(data, seriesKey, altKey = null) {
  if (!data) return null;

  // Shape B: pre-keyed arrays under data.timeline
  if (data.timeline && Array.isArray(data.timeline[seriesKey])) {
    const arr = data.timeline[seriesKey];
    if (arr.some(hasValue)) return arr.map((v) => (hasValue(v) ? Number(v) : null));
  }

  // Shape A: row-based series
  const rows = data.series;
  if (Array.isArray(rows) && rows.length > 0) {
    const primary = rows.map((r) => (hasValue(r[seriesKey]) ? Number(r[seriesKey]) : null));
    if (primary.some((v) => v !== null)) return primary;
    if (altKey) {
      const alt = rows.map((r) => (hasValue(r[altKey]) ? Number(r[altKey]) : null));
      if (alt.some((v) => v !== null)) return alt;
    }
  }

  return null;
}

function extractLabels(data) {
  if (!data) return [];
  if (data.timeline?.labels?.length) return data.timeline.labels;
  if (Array.isArray(data.series)) return data.series.map((r) => r.date || r.time || '');
  return [];
}

// ─── chart config helpers ─────────────────────────────────────────────────────

const CHART_COLORS = {
  temperature: { border: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  salinity:    { border: '#3b82f6', bg: 'rgba(59,130,246,0.06)' },
  chlorophyll: { border: '#22c55e', bg: 'rgba(34,197,94,0.08)'  },
  oxygen:      { border: '#14b8a6', bg: 'rgba(20,184,166,0.08)' },
  ph:          { border: '#8b5cf6', bg: 'rgba(139,92,246,0.07)' },
  nitrate:     { border: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
};

function makeDataset(label, values, colorKey, yAxisID = 'y') {
  const c = CHART_COLORS[colorKey] ?? { border: '#6b7280', bg: 'rgba(107,114,128,0.07)' };
  return {
    label,
    data: values,
    borderColor: c.border,
    backgroundColor: c.bg,
    yAxisID,
    borderWidth: 1.5,
    pointRadius: values.length > 60 ? 0 : 2,
    pointHoverRadius: 4,
    tension: 0.3,
    fill: true,
    spanGaps: true,
  };
}

function buildChartOptions(leftLabel, leftColor, rightLabel = null, rightColor = null) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: {
          color: '#374151',
          font: { size: 10, family: 'ui-monospace, monospace' },
          boxWidth: 12,
          padding: 8,
        },
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0B1E3D',
        bodyColor: '#374151',
        borderColor: '#1C3A63',
        borderWidth: 1,
        titleFont: { size: 11, family: 'ui-monospace, monospace' },
        bodyFont: { size: 10, family: 'ui-monospace, monospace' },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(28,58,99,0.07)' },
        ticks: {
          color: '#6B7C96',
          font: { size: 9, family: 'ui-monospace, monospace' },
          maxTicksLimit: 8,
          maxRotation: 0,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: { color: 'rgba(28,58,99,0.07)' },
        ticks: { color: leftColor, font: { size: 9, family: 'ui-monospace, monospace' } },
        title: { display: true, text: leftLabel, color: leftColor, font: { size: 9 } },
      },
    },
  };

  if (rightLabel && rightColor) {
    base.scales.y1 = {
      type: 'linear',
      display: true,
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: { color: rightColor, font: { size: 9, family: 'ui-monospace, monospace' } },
      title: { display: true, text: rightLabel, color: rightColor, font: { size: 9 } },
    };
  }

  return base;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function RangePills({ active, onChange }) {
  return (
    <div className="flex gap-1">
      {SUPPORTED_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
            active === p.id
              ? 'bg-teal-500 text-white'
              : 'bg-[#F0F4FF] text-[#6B7C96] hover:bg-[#E0E8FF] hover:text-[#0B1E3D]'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function TabPills({ active, onChange }) {
  const tabs = [
    { id: 'physics', label: 'Temp & Sal' },
    { id: 'bgc',     label: 'BGC' },
  ];
  return (
    <div className="flex gap-1 p-0.5 bg-[#F0F4FF] rounded-lg w-fit">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
            active === t.id
              ? 'bg-white text-[#0B1E3D] shadow-sm'
              : 'text-[#6B7C96] hover:text-[#0B1E3D]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TimelineAnalysisSection({ point, region }) {
  const { selectedDepth, selectedDate } = useApp();
  const [preset, setPreset]   = useState('7d');
  const [activeTab, setActiveTab] = useState('physics');

  const { data, loading, fetchError, isStale } = useTimelineData(point, preset, activeTab);

  const labels = useMemo(() => extractLabels(data), [data]);

  // ── Physics chart ──────────────────────────────────────────────────────────
  const tempSeries = useMemo(() => extractSeries(data, 'temperature_c', 'temperature'), [data]);
  const salSeries  = useMemo(() => extractSeries(data, 'salinity_psu',  'salinity'),    [data]);

  const physicsDatasets = useMemo(() => {
    const ds = [];
    if (tempSeries) ds.push(makeDataset('Temperature (°C)', tempSeries, 'temperature', 'y'));
    if (salSeries)  ds.push(makeDataset('Salinity (PSU)',   salSeries,  'salinity',    salSeries && tempSeries ? 'y1' : 'y'));
    return ds;
  }, [tempSeries, salSeries]);

  const physicsOptions = useMemo(() => buildChartOptions(
    'Temp (°C)', '#ef4444',
    salSeries && tempSeries ? 'Salinity (PSU)' : null,
    '#3b82f6',
  ), [tempSeries, salSeries]);

  // ── BGC chart ──────────────────────────────────────────────────────────────
  const chlorSeries    = useMemo(() => extractSeries(data, 'chlorophyll_mgl', 'chlorophyll'), [data]);
  const oxygenSeries   = useMemo(() => extractSeries(data, 'oxygen_mmolm3',  'oxygen'),      [data]);
  const phSeries       = useMemo(() => extractSeries(data, 'ph',              'ph'),          [data]);
  const nitrateSeries  = useMemo(() => extractSeries(data, 'nitrate_mmolm3', 'nitrate'),     [data]);

  const bgcDatasets = useMemo(() => {
    const ds = [];
    if (chlorSeries)   ds.push(makeDataset('Chlorophyll-a (mg m⁻³)', chlorSeries,   'chlorophyll', 'y'));
    if (oxygenSeries)  ds.push(makeDataset('Dissolved O₂ (mmol m⁻³)', oxygenSeries, 'oxygen',      'y1'));
    if (phSeries)      ds.push(makeDataset('pH',                       phSeries,     'ph',          'y'));
    if (nitrateSeries) ds.push(makeDataset('Nitrate (mmol m⁻³)',       nitrateSeries,'nitrate',     'y1'));
    return ds;
  }, [chlorSeries, oxygenSeries, phSeries, nitrateSeries]);

  const bgcOptions = useMemo(() => buildChartOptions(
    chlorSeries ? 'Chl / pH' : 'Value',
    '#22c55e',
    oxygenSeries || nitrateSeries ? 'O₂ / NO₃' : null,
    '#14b8a6',
  ), [chlorSeries, oxygenSeries, nitrateSeries]);

  // ── Active chart selection ─────────────────────────────────────────────────
  const activeDatasets = activeTab === 'physics' ? physicsDatasets : bgcDatasets;
  const activeOptions  = activeTab === 'physics' ? physicsOptions  : bgcOptions;
  const hasData        = labels.length > 0 && activeDatasets.length > 0;

  // No point selected
  if (!point?.lat) {
    return (
      <div className="rounded-xl bg-[#F8FAFC] border border-[#1C3A63]/15 p-4 text-center">
        <Info size={14} className="mx-auto mb-1.5 text-[#6B7C96]/50" />
        <div className="text-[11px] text-[#6B7C96]">Select a point to load timeline data.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-[#1C3A63]/15 shadow-sm overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 border-b border-[#1C3A63]/10">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={11} className="text-teal-600 shrink-0" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6B7C96]">
            Timeline Analysis
          </span>
          {isStale && (
            <span className="ml-auto text-[9px] font-mono text-[#6B7C96]/60 animate-pulse">Updating…</span>
          )}
        </div>

        {/* Tab group + range pills */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabPills active={activeTab} onChange={(t) => { setActiveTab(t); }} />
          <RangePills active={preset} onChange={setPreset} />
        </div>
      </div>

      {/* ── Chart metadata ───────────────────────────────────────────────── */}
      <div className="px-4 py-1.5 bg-[#F8FAFC] border-b border-[#1C3A63]/08 flex flex-wrap gap-x-4 gap-y-0.5">
        <span className="text-[9px] font-mono text-[#6B7C96]">
          {Number(point.lat).toFixed(4)}°, {Number(point.lon).toFixed(4)}°
        </span>
        <span className="text-[9px] font-mono text-[#6B7C96]">depth: {selectedDepth ?? 0} m</span>
        {selectedDate && (
          <span className="text-[9px] font-mono text-[#6B7C96]">ref: {selectedDate}</span>
        )}
        {data?.status && data.status !== 'ok' && (
          <span className="text-[9px] font-mono text-amber-600">{data.status}</span>
        )}
      </div>

      {/* ── Chart area ───────────────────────────────────────────────────── */}
      <div className="px-3 py-3 relative">
        {/* Error */}
        {fetchError && !data && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] font-semibold text-red-700 mb-0.5">Timeline request failed</div>
                <div className="text-[10px] font-mono text-red-500 break-all">{fetchError}</div>
              </div>
            </div>
          </div>
        )}

        {/* Loading (no prior data) */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-[#6B7C96] font-mono">Loading {preset} timeline…</span>
          </div>
        )}

        {/* No data (backend returned empty series) */}
        {!loading && !fetchError && data && !hasData && (
          <div className="flex flex-col items-center justify-center h-32">
            <Info size={14} className="text-[#6B7C96]/50 mb-1.5" />
            <div className="text-[11px] text-[#6B7C96] text-center">
              {activeTab === 'bgc'
                ? 'No BGC timeline data available for this location or range.'
                : 'No timeline data available for this location or range.'}
            </div>
          </div>
        )}

        {/* Chart — stale overlay when re-fetching */}
        {data && hasData && (
          <div className="relative">
            <div
              className={`transition-opacity duration-200 ${isStale ? 'opacity-50' : 'opacity-100'}`}
              style={{ height: '200px' }}
            >
              <Line
                key={`${activeTab}-${preset}`}
                data={{ labels, datasets: activeDatasets }}
                options={activeOptions}
              />
            </div>

            {/* Stale loading overlay */}
            {isStale && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 border border-[#1C3A63]/20 shadow-sm">
                  <div className="w-3 h-3 border border-teal-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[9px] font-mono text-[#6B7C96]">Updating</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Series availability notes */}
        {data && !loading && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activeTab === 'physics' && (
              <>
                {tempSeries && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-600">● Temp</span>}
                {salSeries  && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-600">● Sal</span>}
                {!tempSeries && <span className="text-[9px] font-mono text-[#6B7C96]/60">Temperature: unavailable</span>}
                {!salSeries  && <span className="text-[9px] font-mono text-[#6B7C96]/60">Salinity: unavailable</span>}
              </>
            )}
            {activeTab === 'bgc' && (
              <>
                {chlorSeries   && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-green-50 border border-green-200 text-green-600">● Chl</span>}
                {oxygenSeries  && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-600">● O₂</span>}
                {phSeries      && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-600">● pH</span>}
                {nitrateSeries && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-600">● NO₃</span>}
                {!chlorSeries && !oxygenSeries && !phSeries && !nitrateSeries && (
                  <span className="text-[9px] font-mono text-[#6B7C96]/60">No BGC series returned by backend.</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Attribution ──────────────────────────────────────────────────── */}
      <div className="px-4 pb-2">
        <div className="text-[9px] font-mono text-[#6B7C96]/60">
          Source: Copernicus Marine Service · /ocean/timeline · granularity: day
        </div>
      </div>
    </div>
  );
}
