/**
 * OceanIntelligencePanel — Graphs-First Redesign
 *
 * Route: /ocean-detail (right 40% column)
 *
 * Layout (top to bottom):
 *   1. Compact point-context strip — region / coords / depth / date, one slim row
 *   2. Value-chip strip — Temperature, Salinity, Chlorophyll, Oxygen, pH, Nitrate, pCO₂
 *   3. "Temperature & Salinity" line chart (7d/30d/90d/1yr toggle) — dominant visual
 *   4. "Biogeochemistry" line chart (Chl/O₂/pH/NO₃ tabs + range toggle) — dominant visual
 *   5. One quiet footnote: Observations + AI Explanation coming next
 *
 * States:
 *   - Empty (no point): centred prompt with icon
 *   - Loading: skeleton chips + skeleton chart bars (animate-pulse)
 *   - Error: calm WifiOff message, never raw "Failed to fetch" banner
 *
 * REMOVED:
 *   - Numbered badge rows (1/2/3/4), "Phase 3B+" labels, expand/collapse rows
 *   - Raw red "Request failed / Failed to fetch" banner
 *
 * DECISION — in-slab click-to-select:
 *   NOT implementing new in-slab click wiring here. OceanDetailPage already
 *   has handlePointClick → dispatch(SET_ACTIVE_POINT_QUERY) wired to
 *   OceanWorkspace's onPointClick prop. "Selected point" still comes from
 *   Page 1 navigation (router state / URL params) OR from slab click via
 *   the existing OceanDetailPage callback. No new callback needed for this task.
 *
 * Reuses: usePointData, useTimelineData hooks and their data-fetching logic.
 * Charts are built inline using Chart.js (same setup as TimelineAnalysisSection)
 * rather than importing TimelineAnalysisSection as a nested black box, so we
 * can own the header/framing and not double-render section headers.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import { WifiOff, MousePointer2, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import usePointData from '../../hooks/usePointData';
import useTimelineData, { SUPPORTED_PRESETS } from '../../hooks/useTimelineData';
import { getNearestArgoFloats, getArgoProfile, getGlidersNearest, getGliderProfile } from '../../services/argoApi';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ─── helpers ──────────────────────────────────────────────────────────────────

const hasValue = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const fmt = (v, d = 2) => hasValue(v) ? Number(v).toFixed(d) : null;

function coordLabel(lat, lon) {
  const la = Math.abs(lat).toFixed(3);
  const lo = Math.abs(lon).toFixed(3);
  return `${la}°${lat >= 0 ? 'N' : 'S'}, ${lo}°${lon >= 0 ? 'E' : 'W'}`;
}

// ─── chart helpers ─────────────────────────────────────────────────────────────

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
          font: { size: 9, family: 'ui-monospace, monospace' },
          boxWidth: 10,
          padding: 6,
        },
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0B1E3D',
        bodyColor: '#374151',
        borderColor: '#1C3A63',
        borderWidth: 1,
        titleFont: { size: 10, family: 'ui-monospace, monospace' },
        bodyFont: { size: 9, family: 'ui-monospace, monospace' },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(28,58,99,0.06)' },
        ticks: {
          color: '#6B7C96',
          font: { size: 8, family: 'ui-monospace, monospace' },
          maxTicksLimit: 7,
          maxRotation: 0,
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: { color: 'rgba(28,58,99,0.06)' },
        ticks: { color: leftColor, font: { size: 8, family: 'ui-monospace, monospace' } },
        title: { display: true, text: leftLabel, color: leftColor, font: { size: 8 } },
      },
    },
  };
  if (rightLabel && rightColor) {
    base.scales.y1 = {
      type: 'linear',
      display: true,
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: { color: rightColor, font: { size: 8, family: 'ui-monospace, monospace' } },
      title: { display: true, text: rightLabel, color: rightColor, font: { size: 8 } },
    };
  }
  return base;
}

function extractSeries(data, seriesKey, altKey = null) {
  if (!data) return null;
  if (data.timeline && Array.isArray(data.timeline[seriesKey])) {
    const arr = data.timeline[seriesKey];
    if (arr.some(hasValue)) return arr.map((v) => (hasValue(v) ? Number(v) : null));
  }
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

// ─── Section 4 & 5: Observations (Argo floats) and Gliders & Moorings ─────────

/** Inline depth-vs-temp/salinity chart reusing the existing Chart.js registration */
function InlineProfileChart({ profile }) {
  const depths = profile.map((p) => p.depth_m ?? p.depth ?? p.pres ?? 0);
  const temps  = profile.map((p) => p.temperature_c ?? p.temperature ?? p.temp ?? null);
  const sals   = profile.map((p) => p.salinity_psu ?? p.salinity ?? p.sal ?? null);
  const hasSal = sals.some((v) => v !== null);
  // Flag if any level is marked as gridded model output rather than a direct reading
  const isModelEstimate = profile.some((p) => p.source === 'model' || p.is_gridded === true);

  const chartData = {
    labels: depths,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: temps,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.07)',
        tension: 0.35,
        fill: true,
        yAxisID: 'x',
        pointRadius: 0,
        borderWidth: 1.5,
      },
      ...(hasSal ? [{
        label: 'Salinity (PSU)',
        data: sals,
        borderColor: '#3b82f6',
        backgroundColor: 'transparent',
        tension: 0.35,
        yAxisID: 'x1',
        pointRadius: 0,
        borderWidth: 1.5,
      }] : []),
    ],
  };

  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: true, labels: { color: '#374151', font: { size: 8, family: 'ui-monospace, monospace' }, boxWidth: 8, padding: 4 } },
      tooltip: {
        backgroundColor: '#fff', titleColor: '#0B1E3D', bodyColor: '#374151',
        borderColor: '#1C3A63', borderWidth: 1,
        titleFont: { size: 9 }, bodyFont: { size: 8 },
        callbacks: { title: (items) => `Depth: ${items[0]?.label} m` },
      },
    },
    scales: {
      y: {
        reverse: true,
        title: { display: true, text: 'Depth (m)', color: '#6B7C96', font: { size: 8 } },
        ticks: { color: '#6B7C96', font: { size: 8, family: 'ui-monospace, monospace' } },
        grid: { color: 'rgba(28,58,99,0.06)' },
      },
      x: {
        title: { display: true, text: 'Temp (°C)', color: '#ef4444', font: { size: 8 } },
        ticks: { color: '#6B7C96', font: { size: 8, family: 'ui-monospace, monospace' } },
        grid: { color: 'rgba(28,58,99,0.06)' },
      },
      ...(hasSal ? {
        x1: {
          position: 'top',
          title: { display: true, text: 'Salinity (PSU)', color: '#3b82f6', font: { size: 8 } },
          ticks: { color: '#3b82f6', font: { size: 8, family: 'ui-monospace, monospace' } },
          grid: { drawOnChartArea: false },
        },
      } : {}),
    },
  };

  return (
    <div className="px-2 pb-2 pt-1.5">
      {isModelEstimate && (
        <p className="text-[9px] italic text-[#6B7C96] mb-1">
          <em>Model estimate</em> — BGC values are gridded model output, not a direct float reading
        </p>
      )}
      <div style={{ height: 148 }}>
        <Line data={chartData} options={opts} />
      </div>
    </div>
  );
}

/** Single float/glider row with expand-to-profile toggle */
function ObsRow({ item, isGlider }) {
  const [expanded, setExpanded] = useState(false);
  const [profile,  setProfile]  = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState(null);

  const toggle = useCallback(async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (profile !== null) return;
    setBusy(true);
    setErr(null);
    try {
      const res = isGlider
        ? await getGliderProfile(item.dataset_id ?? item.id)
        : await getArgoProfile(item.platform_number ?? item.id);
      const prof = res?.profile ?? [];
      setProfile(prof);
      if (!prof.length) setErr('No profile data returned for this platform.');
    } catch (e) {
      setErr(`Profile unavailable: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }, [expanded, profile, item, isGlider]);

  const typeLabel = isGlider ? 'Glider'
    : item.type === 'bgc' ? 'BGC-Argo' : 'Core Argo';
  const typeColor = isGlider ? '#ec4899'
    : item.type === 'bgc' ? '#a855f7' : '#38bdf8';

  return (
    <div className="border border-[#1C3A63]/10 rounded-lg overflow-hidden bg-white">
      <div
        className="flex items-center justify-between gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[#F8FAFC] transition-colors select-none"
        onClick={toggle}
        role="button"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: `${typeColor}18`, color: typeColor }}
          >
            {typeLabel}
          </span>
          <span className="text-[10px] font-mono text-[#0B1E3D] truncate">
            #{item.platform_number ?? item.dataset_id ?? item.id}
          </span>
          {item.last_date && (
            <span className="text-[9px] text-[#6B7C96] font-mono ml-auto shrink-0 pl-1">
              {item.last_date}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.distance_km != null && (
            <span className="text-[9px] font-mono text-[#6B7C96]">
              {Number(item.distance_km).toFixed(0)} km
            </span>
          )}
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 hover:bg-teal-100 border border-teal-200 transition-colors">
            {expanded ? 'Hide' : 'View Profile'}
          </span>
          {expanded
            ? <ChevronUp size={10} className="text-[#6B7C96]" />
            : <ChevronDown size={10} className="text-[#6B7C96]" />
          }
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#1C3A63]/08">
          {busy && <div className="px-2.5 py-3 text-[9px] font-mono text-[#6B7C96] animate-pulse">Loading profile…</div>}
          {err && !busy && <div className="px-2.5 py-2 text-[9px] font-mono text-[#6B7C96]">{err}</div>}
          {!busy && profile !== null && profile.length > 0 && <InlineProfileChart profile={profile} />}
        </div>
      )}
    </div>
  );
}

/** Section 4 — Nearby Argo float list, max 5, from /argo/nearest */
function ArgoObservationsSection({ lat, lon }) {
  const [floats,  setFloats]  = useState(null);
  const [loading, setLoading] = useState(false);
  const prevKey = useRef(null);

  useEffect(() => {
    if (lat == null || lon == null) return;
    const key = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    setLoading(true);
    setFloats(null);
    getNearestArgoFloats(lat, lon, 500, 'both')
      .then((res) => setFloats(res?.floats ?? []))
      .catch(() => setFloats([]))
      .finally(() => setLoading(false));
  }, [lat, lon]);

  if (lat == null || lon == null) return null;
  const display = (floats ?? []).slice(0, 5);

  return (
    <div className="rounded-xl border border-[#1C3A63]/12 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1C3A63]/08">
        <span className="text-[11px] font-semibold text-[#0B1E3D]">Nearby Argo Floats</span>
        {floats !== null && (
          <span className="text-[9px] font-mono text-[#6B7C96]">
            {display.length} of {floats.length} within 500 km
          </span>
        )}
      </div>
      <div className="px-2 py-2 space-y-1.5">
        {loading && [1,2,3].map((i) => (
          <div key={i} className="h-8 rounded-lg bg-[#E8EDF5] animate-pulse" />
        ))}
        {!loading && floats !== null && display.length === 0 && (
          <p className="px-1 py-2 text-[9px] font-mono text-[#6B7C96]">
            No Argo floats found within 500 km of this point.
          </p>
        )}
        {!loading && display.map((f) => (
          <ObsRow key={f.platform_number ?? f.id} item={f} isGlider={false} />
        ))}
      </div>
    </div>
  );
}

/**
 * Section 5 — Gliders & Moorings from /glider/nearest.
 * Per spec: entirely absent (returns null) when the endpoint returns 0 results —
 * no empty state, no error message, no placeholder text.
 */
function GlidersSection({ lat, lon }) {
  const [gliders, setGliders] = useState(null);
  const [loading, setLoading] = useState(false);
  const prevKey = useRef(null);

  useEffect(() => {
    if (lat == null || lon == null) return;
    const key = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    setLoading(true);
    setGliders(null);
    getGlidersNearest(lat, lon, 800)
      .then((res) => setGliders(res?.gliders ?? []))
      .catch(() => setGliders([]))
      .finally(() => setLoading(false));
  }, [lat, lon]);

  if (lat == null || lon == null) return null;
  // Not yet resolved — show skeleton so layout doesn't jump
  if (loading || gliders === null) return (
    <div className="rounded-xl border border-[#1C3A63]/12 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-[#1C3A63]/08">
        <div className="h-3 w-32 rounded bg-[#E8EDF5] animate-pulse" />
      </div>
      <div className="px-2 py-2 space-y-1.5">
        {[1,2].map((i) => <div key={i} className="h-8 rounded-lg bg-[#E8EDF5] animate-pulse" />)}
      </div>
    </div>
  );
  // Zero results → section entirely absent, per master spec
  if (gliders.length === 0) return null;

  const display = gliders.slice(0, 5);
  return (
    <div className="rounded-xl border border-[#1C3A63]/12 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1C3A63]/08">
        <span className="text-[11px] font-semibold text-[#0B1E3D]">Gliders &amp; Moorings</span>
        <span className="text-[9px] font-mono text-[#6B7C96]">
          {display.length} of {gliders.length} within 800 km
        </span>
      </div>
      <div className="px-2 py-2 space-y-1.5">
        {display.map((g) => (
          <ObsRow key={g.dataset_id ?? g.id} item={g} isGlider={true} />
        ))}
      </div>
    </div>
  );
}

// ─── sub-components ────────────────────────────────────────────────────────────

/** Slim range-toggle pills (7d / 30d / 90d / 1yr) */
function RangePills({ active, onChange }) {
  return (
    <div className="flex gap-1">
      {SUPPORTED_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          className={`px-2 py-0.5 rounded text-[9px] font-mono font-semibold transition-colors cursor-pointer ${
            active === p.id
              ? 'bg-teal-500 text-white'
              : 'bg-[#EEF2FA] text-[#6B7C96] hover:bg-[#DDE4F5] hover:text-[#0B1E3D]'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** BGC variable tab switcher (Chl-a / O₂ / pH / NO₃) */
const BGC_TABS = [
  { id: 'chlorophyll', label: 'Chl-a' },
  { id: 'oxygen',      label: 'O₂'   },
  { id: 'ph',         label: 'pH'   },
  { id: 'nitrate',    label: 'NO₃'  },
];

function BgcTabPills({ active, onChange }) {
  return (
    <div className="flex gap-0.5 p-0.5 bg-[#EEF2FA] rounded">
      {BGC_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-colors cursor-pointer ${
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

/** One value chip in the compact current-values strip */
function ValueChip({ label, value, unit, color = '#0B1E3D' }) {
  return (
    <div
      className="flex flex-col items-center px-2.5 py-1.5 rounded-lg border border-[#1C3A63]/15 bg-white/80 shrink-0"
      style={{ minWidth: '62px' }}
    >
      <span className="text-[8px] font-mono uppercase tracking-wider text-[#6B7C96] whitespace-nowrap">{label}</span>
      {value !== null ? (
        <span className="text-[12px] font-mono font-bold mt-0.5" style={{ color }}>
          {value}
          {unit && <span className="text-[8px] font-normal text-[#6B7C96] ml-0.5">{unit}</span>}
        </span>
      ) : (
        <span className="text-[11px] font-mono text-[#1C3A63]/30 mt-0.5">—</span>
      )}
    </div>
  );
}

/** Skeleton chip while point data is loading */
function SkeletonChip() {
  return (
    <div className="flex flex-col items-center px-2.5 py-1.5 rounded-lg border border-[#1C3A63]/10 bg-white/50 shrink-0 gap-1" style={{ minWidth: '62px' }}>
      <div className="h-2 w-8 rounded bg-[#E8EDF5] animate-pulse" />
      <div className="h-3 w-10 rounded bg-[#E8EDF5] animate-pulse" />
    </div>
  );
}

/** Skeleton chart placeholder while timeline data loads */
function SkeletonChart({ height = 160 }) {
  return (
    <div className="rounded-lg border border-[#1C3A63]/10 bg-[#F8FAFC] overflow-hidden" style={{ height }}>
      <div className="flex items-end gap-1 h-full px-4 pb-4 pt-6">
        {[42, 58, 47, 72, 53, 78, 49, 68, 44, 63, 55, 71].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t animate-pulse"
            style={{
              height: `${h}%`,
              background: `rgba(20,184,166,${0.07 + (i % 4) * 0.035})`,
              animationDelay: `${i * 55}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Wrapper card for each chart block */
function ChartCard({ title, badge, headerRight, children }) {
  return (
    <div className="rounded-xl border border-[#1C3A63]/12 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1C3A63]/08 flex-wrap gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#6B7C96]">
            {title}
          </span>
          {badge && (
            <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-teal-50 border border-teal-200/80 text-teal-700 animate-pulse">
              {badge}
            </span>
          )}
        </div>
        {headerRight}
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

/** Calm offline/error message (replaces raw "Failed to fetch" banner) */
function OfflineMsg() {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#1C3A63]/15 text-[10px] text-[#6B7C96]">
      <WifiOff size={12} className="shrink-0 text-[#6B7C96]/50" />
      <span>Live data unavailable — check your connection</span>
    </div>
  );
}

/** Stale update indicator pill overlay */
function StaleOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/90 border border-[#1C3A63]/20 shadow-sm">
        <div className="w-2.5 h-2.5 border border-teal-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-[8px] font-mono text-[#6B7C96]">Updating</span>
      </div>
    </div>
  );
}

// ─── Temperature & Salinity chart ─────────────────────────────────────────────

function TempSalChart({ point }) {
  const [preset, setPreset] = useState('7d');
  const { data, loading, fetchError, isStale } = useTimelineData(point, preset, 'physics');

  const labels     = useMemo(() => extractLabels(data), [data]);
  const tempSeries = useMemo(() => extractSeries(data, 'temperature_c', 'temperature'), [data]);
  const salSeries  = useMemo(() => extractSeries(data, 'salinity_psu', 'salinity'), [data]);

  const datasets = useMemo(() => {
    const ds = [];
    if (tempSeries) ds.push(makeDataset('Temp (°C)', tempSeries, 'temperature', 'y'));
    if (salSeries)  ds.push(makeDataset('Sal (PSU)', salSeries, 'salinity', tempSeries ? 'y1' : 'y'));
    return ds;
  }, [tempSeries, salSeries]);

  const options = useMemo(() => buildChartOptions(
    'Temp (°C)', '#ef4444',
    salSeries && tempSeries ? 'Sal (PSU)' : null,
    '#3b82f6',
  ), [tempSeries, salSeries]);

  const hasData = labels.length > 0 && datasets.length > 0;

  return (
    <ChartCard
      title="Temperature & Salinity"
      badge={isStale ? 'updating…' : null}
      headerRight={<RangePills active={preset} onChange={setPreset} />}
    >
      {fetchError && !data && <OfflineMsg />}
      {loading && !data && <SkeletonChart height={168} />}
      {!loading && !fetchError && data && !hasData && (
        <div className="flex items-center justify-center h-20 text-[10px] text-[#6B7C96]/70 font-mono">
          No data available for this range
        </div>
      )}
      {data && hasData && (
        <div className="relative" style={{ height: '168px' }}>
          <div className={`transition-opacity duration-200 h-full ${isStale ? 'opacity-50' : 'opacity-100'}`}>
            <Line key={`ts-${preset}`} data={{ labels, datasets }} options={options} />
          </div>
          {isStale && <StaleOverlay />}
        </div>
      )}
    </ChartCard>
  );
}

// ─── Biogeochemistry chart ─────────────────────────────────────────────────────

const BGC_SERIES_MAP = {
  chlorophyll: { key: 'chlorophyll_mgl', alt: 'chlorophyll', label: 'Chl-a (mg m⁻³)', colorKey: 'chlorophyll' },
  oxygen:      { key: 'oxygen_mmolm3',   alt: 'oxygen',      label: 'O₂ (mmol m⁻³)',  colorKey: 'oxygen'      },
  ph:          { key: 'ph',              alt: 'ph',          label: 'pH',              colorKey: 'ph'          },
  nitrate:     { key: 'nitrate_mmolm3',  alt: 'nitrate',     label: 'NO₃ (mmol m⁻³)', colorKey: 'nitrate'     },
};

function BgcChart({ point }) {
  const [preset, setPreset]       = useState('7d');
  const [activeVar, setActiveVar] = useState('chlorophyll');
  const { data, loading, fetchError, isStale } = useTimelineData(point, preset, 'bgc');

  const labels    = useMemo(() => extractLabels(data), [data]);
  const seriesDef = BGC_SERIES_MAP[activeVar];

  const activeSeries = useMemo(
    () => extractSeries(data, seriesDef.key, seriesDef.alt),
    [data, seriesDef],
  );

  const datasets = useMemo(() => {
    if (!activeSeries) return [];
    return [makeDataset(seriesDef.label, activeSeries, seriesDef.colorKey, 'y')];
  }, [activeSeries, seriesDef]);

  const options = useMemo(() => buildChartOptions(
    seriesDef.label, CHART_COLORS[seriesDef.colorKey]?.border ?? '#6b7280',
  ), [seriesDef]);

  const hasData = labels.length > 0 && datasets.length > 0;

  return (
    <ChartCard
      title="Biogeochemistry"
      badge={isStale ? 'updating…' : null}
      headerRight={
        <div className="flex items-center gap-1.5 flex-wrap">
          <BgcTabPills active={activeVar} onChange={setActiveVar} />
          <RangePills active={preset} onChange={setPreset} />
        </div>
      }
    >
      {fetchError && !data && <OfflineMsg />}
      {loading && !data && <SkeletonChart height={160} />}
      {!loading && !fetchError && data && !hasData && (
        <div className="flex items-center justify-center h-20 text-[10px] text-[#6B7C96]/70 font-mono">
          No {seriesDef.label.split(' ')[0]} data for this range
        </div>
      )}
      {data && hasData && (
        <div className="relative" style={{ height: '160px' }}>
          <div className={`transition-opacity duration-200 h-full ${isStale ? 'opacity-50' : 'opacity-100'}`}>
            <Line
              key={`bgc-${activeVar}-${preset}`}
              data={{ labels, datasets }}
              options={options}
            />
          </div>
          {isStale && <StaleOverlay />}
        </div>
      )}
    </ChartCard>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function OceanIntelligencePanel({ point, region }) {
  const { selectedDepth, selectedDate } = useApp();
  const { data, loading, fetchError } = usePointData(point);

  const hasPoint = point?.lat != null && point?.lon != null;

  // Derived values for the chip strip
  const phy = data?.physics ?? {};
  const bgc = data?.bgc ?? {};

  // ── Empty state — no point selected ─────────────────────────────────────────
  if (!hasPoint) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-white border-l border-[#1C3A63]/15 px-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#F0F5FF] border border-[#1C3A63]/12 flex items-center justify-center">
          <MousePointer2 size={22} className="text-teal-500" />
        </div>
        <div>
          <div className="text-[14px] font-semibold text-[#0B1E3D] mb-1.5">No point selected</div>
          <div className="text-[12px] text-[#6B7C96] leading-relaxed">
            Click a point on the 3D model to see live oceanographic data here.
          </div>
        </div>
        <div className="text-[10px] font-mono text-[#6B7C96]/40 mt-1">
          Ocean Intelligence · OceanStream
        </div>
      </div>
    );
  }

  // ── Panel — point selected ──────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col bg-[#F4F7FC] border-l border-[#1C3A63]/15 overflow-hidden">

      {/* ── 1. Compact context strip ─────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border-b border-[#1C3A63]/12 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Layers size={10} className="text-teal-500 shrink-0" />
          {region && (
            <span className="text-[11px] font-semibold text-[#0B1E3D] truncate">{region}</span>
          )}
          {region && <span className="text-[#1C3A63]/25 text-[10px]">·</span>}
          <span className="text-[10px] font-mono text-[#6B7C96] whitespace-nowrap">
            {coordLabel(point.lat, point.lon)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] font-mono text-[#6B7C96]">{selectedDepth ?? 0} m</span>
          {selectedDate && (
            <>
              <span className="text-[#1C3A63]/20 text-[9px]">·</span>
              <span className="text-[9px] font-mono text-[#6B7C96]">{selectedDate}</span>
            </>
          )}
        </div>
      </div>

      {/* ── 2. Current-values chip strip ─────────────────────────────────── */}
      <div className="shrink-0 px-3 py-2.5 bg-white border-b border-[#1C3A63]/10">
        {/* Offline error (replaces raw red banner) */}
        {!loading && fetchError && <OfflineMsg />}

        {/* Skeleton chips while loading */}
        {loading && !data && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {Array.from({ length: 7 }).map((_, i) => <SkeletonChip key={i} />)}
          </div>
        )}

        {/* Real value chips */}
        {data && !fetchError && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <ValueChip label="Temp"     value={fmt(phy.temperature_c)}     unit="°C"   color="#ef4444" />
            <ValueChip label="Salinity" value={fmt(phy.salinity_psu)}      unit="PSU"  color="#3b82f6" />
            <ValueChip label="Chl-a"   value={fmt(bgc.chlorophyll_mgl, 3)} unit="mg"   color="#22c55e" />
            <ValueChip label="O₂"      value={fmt(bgc.oxygen_mmolm3, 1)}  unit="mmol" color="#14b8a6" />
            <ValueChip label="pH"      value={fmt(bgc.ph, 3)}             unit=""     color="#8b5cf6" />
            <ValueChip label="NO₃"    value={fmt(bgc.nitrate_mmolm3)}    unit="mmol" color="#f59e0b" />
            <ValueChip label="pCO₂"   value={fmt(bgc.pco2_uatm, 1)}     unit="μatm" color="#6366f1" />
          </div>
        )}
      </div>

      {/* ── 3–4. Charts (dominant visual content) ───────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">

        {/* Skeleton chart blocks during first load */}
        {loading && !data && (
          <>
            <div className="rounded-xl border border-[#1C3A63]/12 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#1C3A63]/08">
                <div className="h-2.5 w-28 rounded bg-[#E8EDF5] animate-pulse" />
                <div className="h-4 w-20 rounded bg-[#E8EDF5] animate-pulse" />
              </div>
              <div className="px-3 py-2"><SkeletonChart height={168} /></div>
            </div>
            <div className="rounded-xl border border-[#1C3A63]/12 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#1C3A63]/08">
                <div className="h-2.5 w-24 rounded bg-[#E8EDF5] animate-pulse" />
                <div className="h-4 w-36 rounded bg-[#E8EDF5] animate-pulse" />
              </div>
              <div className="px-3 py-2"><SkeletonChart height={160} /></div>
            </div>
          </>
        )}

        {/* Live charts — always mount once a point is selected */}
        {(!loading || data) && (
          <>
            <TempSalChart point={point} />
            <BgcChart point={point} />
          </>
        )}


        {/* ── Section 4: Argo Observations ──────────────────────────────── */}
        {(!loading || data) && (
          <ArgoObservationsSection lat={point?.lat} lon={point?.lon} />
        )}

        {/* ── Section 5: Gliders & Moorings (absent when empty) ─────────── */}
        {(!loading || data) && (
          <GlidersSection lat={point?.lat} lon={point?.lon} />
        )}

        <div className="h-2" />

      </div>
    </div>
  );
}
