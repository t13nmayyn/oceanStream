/**
 * SummarySidebar — Phase 2C
 *
 * Authoritative field mappings (from ocean.types.ts and main.py):
 *
 * /ocean/point response shape:
 *   { status, lat, lon, depth, date, cache?,
 *     physics?: { temperature_c, salinity_psu, current_u_ms, current_v_ms, sea_level_m },
 *     bgc?:     { chlorophyll_mgl, oxygen_mmolm3, nitrate_mmolm3, ph, pco2_uatm },
 *     nearest_argo_float?, dataset_info? }
 *
 * /ocean/timeline response shape:
 *   { status, point, date_start, date_end, n_points,
 *     series: [ { date, temperature_c?, salinity_psu?, chlorophyll_mgl?,
 *                 sea_level_m?, current_u_ms?, current_v_ms? } ],
 *     dataset_info, cache, elapsed_ms }
 *
 * Rules:
 * - Never fabricate values. Rows with null values are hidden, not filled with 0.
 * - Trend shown only when ≥2 finite values exist in the series.
 * - Sparklines shown only when ≥2 finite values exist.
 * - "Weather & Ocean Conditions" shown only if current_u_ms or current_v_ms is finite.
 * - "Last updated" from response date_end or point date, never hardcoded.
 * - No cache/L1/L2 badges on Page 1.
 * - No direct fetch() — uses getOceanPoint and getOceanTimeline from oceanApi.js.
 * - Duplicate-request guard: only refetches when (lat, lon) key actually changes.
 * - Globe renders independently; this component loads after mount, never blocking.
 */
import { useState, useEffect, useRef } from 'react';
import { getOceanPoint, getOceanTimeline } from '../../services/oceanApi';
import { ArrowUpRight, ArrowDownRight, Minus, Wind, Activity, Thermometer, Droplets, Waves } from 'lucide-react';

// ── Sparkline ────────────────────────────────────────────────────────────────

/** Renders an inline SVG polyline from an array of finite numbers. */
function Sparkline({ data, color }) {
  const validData = (data || []).filter((d) => typeof d === 'number' && Number.isFinite(d));
  if (validData.length < 2) return null; // Don't render with < 2 points

  const min = Math.min(...validData);
  const max = Math.max(...validData);
  const range = max - min || 1;
  const W = 80;
  const H = 24;
  const points = validData
    .map((d, i) => {
      const x = (i / (validData.length - 1)) * W;
      const y = H - ((d - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="overflow-visible shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

// ── Trend calculation ─────────────────────────────────────────────────────────

/**
 * Computes percentage change from first to last finite value.
 * Returns null when fewer than 2 finite values exist — never fabricates a trend.
 */
function calcTrend(arr) {
  const valid = (arr || []).filter((d) => typeof d === 'number' && Number.isFinite(d));
  if (valid.length < 2) return null;
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (first === 0) return 0;
  return Number((((last - first) / Math.abs(first)) * 100).toFixed(1));
}

// ── MetricRow ─────────────────────────────────────────────────────────────────

function TrendBadge({ trend }) {
  if (trend === null) return null;
  if (trend > 0) return (
    <span className="flex items-center text-[10px] font-semibold text-emerald-500 ml-1">
      <ArrowUpRight size={11} /> {trend}%
    </span>
  );
  if (trend < 0) return (
    <span className="flex items-center text-[10px] font-semibold text-rose-500 ml-1">
      <ArrowDownRight size={11} /> {Math.abs(trend)}%
    </span>
  );
  return (
    <span className="flex items-center text-[10px] font-semibold text-slate-400 ml-1">
      <Minus size={11} /> 0%
    </span>
  );
}

/**
 * A single metric row: icon + label, value + unit + trend badge, sparkline.
 * The entire row is suppressed when value === null (never shows "--" for missing real data).
 */
function MetricRow({ icon: Icon, label, value, unit, trend, sparklineData, color }) {
  if (value === null) return null; // hide row rather than show "--"
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div
        className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
        style={{ backgroundColor: `${color}15`, color }}
      >
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</div>
        <div className="flex items-baseline gap-0">
          <span className="text-[15px] font-bold text-slate-800">{value}</span>
          <span className="text-[11px] text-slate-500 font-medium ml-1">{unit}</span>
          <TrendBadge trend={trend} />
        </div>
      </div>
      <div className="shrink-0">
        <Sparkline data={sparklineData} color={color} />
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex gap-3 items-center py-2.5 border-b border-slate-100 last:border-0">
      <div className="w-7 h-7 rounded-full bg-slate-100 animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2 w-14 bg-slate-100 rounded animate-pulse" />
        <div className="h-3.5 w-20 bg-slate-100 rounded animate-pulse" />
      </div>
      <div className="w-20 h-5 bg-slate-100 rounded animate-pulse shrink-0" />
    </div>
  );
}

// ── SummarySidebar ────────────────────────────────────────────────────────────

const DEFAULT_LAT = -5.0;  // Indian Ocean default
const DEFAULT_LON = 78.0;

export default function SummarySidebar({ focusedRegion }) {
  const [loading, setLoading] = useState(true);
  const [pointData, setPointData] = useState(null);
  const [seriesData, setSeriesData] = useState(null); // array of {date, temperature_c, ...} rows
  const [lastDateStr, setLastDateStr] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  // Dedup guard — only refetch when coordinates genuinely change
  const lastKeyRef = useRef(null);

  useEffect(() => {
    const lat = focusedRegion?.lat ?? DEFAULT_LAT;
    const lon = focusedRegion?.lng ?? DEFAULT_LON;
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;

    if (key === lastKeyRef.current) return; // same region, skip
    lastKeyRef.current = key;

    let active = true;
    setLoading(true);
    setFetchError(null);

    Promise.all([
      getOceanPoint(lat, lon, 0),
      getOceanTimeline(lat, lon, 0, '30d', 'temperature,salinity,chlorophyll,sea_level'),
    ])
      .then(([pointRes, timelineRes]) => {
        if (!active) return;

        setPointData(pointRes);

        // /ocean/timeline returns { status, series: [...], date_end, ... }
        // getOceanTimeline catches errors and returns { status: 'unavailable', timeline: null }
        const series = timelineRes?.series ?? null;
        setSeriesData(Array.isArray(series) && series.length > 0 ? series : null);

        // Last updated: prefer timeline date_end, then point date, then null
        const dateStr = timelineRes?.date_end ?? pointRes?.date ?? null;
        setLastDateStr(dateStr);

        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('[SummarySidebar] fetch error:', err?.message);
        setFetchError('Unable to load region data.');
        setLoading(false);
      });

    return () => { active = false; };
  }, [focusedRegion]);

  // ── Derive display values from real response fields ───────────────────────

  const phy = pointData?.physics ?? {};
  const bgc = pointData?.bgc ?? {};

  // Point values — null if field absent or non-finite
  const hasVal = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

  const temp  = hasVal(phy.temperature_c)  ? Number(phy.temperature_c).toFixed(1)  : null;
  const salt  = hasVal(phy.salinity_psu)   ? Number(phy.salinity_psu).toFixed(2)   : null;
  const chl   = hasVal(bgc.chlorophyll_mgl) ? Number(bgc.chlorophyll_mgl).toFixed(3) : null;
  const ssh   = hasVal(phy.sea_level_m)    ? Number(phy.sea_level_m).toFixed(3)    : null;

  // Current data — only show "Weather & Ocean Conditions" when real values present
  const hasCurrentData = hasVal(phy.current_u_ms) && hasVal(phy.current_v_ms);
  const currentSpeed = hasCurrentData
    ? Math.hypot(Number(phy.current_u_ms), Number(phy.current_v_ms)).toFixed(2)
    : null;
  const currentDir = hasCurrentData
    ? (((Math.atan2(Number(phy.current_u_ms), Number(phy.current_v_ms)) * 180) / Math.PI) + 360) % 360
    : null;

  // Sparkline data — extracted from series array. Each row: { date, temperature_c, ... }
  const extractSeries = (key) =>
    seriesData ? seriesData.map((row) => row[key]).filter((v) => Number.isFinite(v)) : null;

  const tempSeries = extractSeries('temperature_c');
  const saltSeries = extractSeries('salinity_psu');
  const chlSeries  = extractSeries('chlorophyll_mgl');
  const sshSeries  = extractSeries('sea_level_m');

  // Last updated display
  const displayDate = lastDateStr
    ? new Date(lastDateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Location label
  const locationLabel = focusedRegion
    ? (focusedRegion.name !== 'Custom Region'
        ? focusedRegion.name
        : `${focusedRegion.lat.toFixed(2)}°N, ${focusedRegion.lng.toFixed(2)}°E`)
    : 'Indian Ocean (default)';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute top-4 right-4 z-10 w-[280px] bg-white/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl rounded-2xl border border-slate-200/50 overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
        <h3 className="text-[13px] font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Activity size={14} className="text-teal-600 shrink-0" />
          Region Summary
        </h3>
        <div className="text-[11px] text-slate-500 mt-0.5 font-medium truncate">
          {locationLabel}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {loading ? (
          <div>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : fetchError ? (
          <div className="text-[12px] text-rose-600 bg-rose-50 border border-rose-100 p-3 rounded-lg my-2">
            {fetchError}
          </div>
        ) : (
          <div>
            <MetricRow
              icon={Thermometer}
              label="SST"
              value={temp}
              unit="°C"
              trend={calcTrend(tempSeries)}
              sparklineData={tempSeries}
              color="#ef4444"
            />
            <MetricRow
              icon={Droplets}
              label="Salinity"
              value={salt}
              unit="PSU"
              trend={calcTrend(saltSeries)}
              sparklineData={saltSeries}
              color="#0ea5e9"
            />
            <MetricRow
              icon={Activity}
              label="Ocean Productivity"
              value={chl}
              unit="mg/m³"
              trend={calcTrend(chlSeries)}
              sparklineData={chlSeries}
              color="#10b981"
            />
            <MetricRow
              icon={Waves}
              label="Sea Level Anomaly"
              value={ssh}
              unit="m"
              trend={calcTrend(sshSeries)}
              sparklineData={sshSeries}
              color="#6366f1"
            />

            {/* Weather & Ocean Conditions — only when current data is present */}
            {hasCurrentData && (
              <div className="mt-1 pt-3 border-t border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Weather &amp; Ocean Conditions
                </div>
                <div className="flex items-center gap-2 text-[12px] text-slate-700 font-medium">
                  <Wind size={13} className="text-slate-400 shrink-0" />
                  <span>Current: {currentSpeed} m/s</span>
                  <span className="text-[10px] text-slate-500">({currentDir.toFixed(0)}°)</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {!loading && !fetchError && displayDate && (
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 shrink-0">
          <div className="text-[10px] text-slate-400 font-mono text-center">
            Last updated: {displayDate}
          </div>
        </div>
      )}
    </div>
  );
}
