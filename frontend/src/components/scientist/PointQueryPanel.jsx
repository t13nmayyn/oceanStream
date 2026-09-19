import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, X, Thermometer, Wind,
  Microscope, Radio, TrendingUp, ArrowUpRight,
  AlertTriangle, Database
} from 'lucide-react';
import { getOceanPoint } from '../../services/oceanApi';
import { useApp, useAppDispatch } from '../../context/AppContext';

// ─── tiny helpers ────────────────────────────────────────────────────────────

/** Returns true only when a value is a finite number (not null, not NaN, not undefined) */
const hasValue = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/** Format a number or return null if unavailable */
const fmt = (v, decimals = 2) => hasValue(v) ? Number(v).toFixed(decimals) : null;

/** Compute current speed from u,v components */
const currentSpeed = (u, v) =>
  hasValue(u) && hasValue(v)
    ? Math.sqrt(Number(u) ** 2 + Number(v) ** 2).toFixed(3)
    : null;

/** Compute current bearing in degrees from north */
const currentBearing = (u, v) => {
  if (!hasValue(u) || !hasValue(v)) return null;
  const deg = (Math.atan2(Number(u), Number(v)) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
};

/** Cardinal direction from bearing */
const toCardinal = (deg) => {
  if (deg === null) return null;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
};

// ─── sub-components ──────────────────────────────────────────────────────────

const SectionLabel = ({ icon: Icon, label, accent = 'text-slate-400' }) => (
  <div className={`flex items-center gap-1.5 text-[9px] font-mono font-semibold uppercase tracking-widest ${accent}`}>
    <Icon size={10} />
    <span>{label}</span>
  </div>
);

/** A single scientific metric cell */
const MetricCell = ({ label, value, unit, accent = 'text-slate-100', size = 'normal', dim = false }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wide">{label}</span>
    {value !== null ? (
      <div className={`font-mono font-bold leading-none ${size === 'large' ? 'text-xl' : 'text-sm'} ${accent}`}>
        {value}
        {unit && <span className={`text-[9px] font-normal ml-0.5 ${dim ? 'text-slate-600' : 'text-slate-400'}`}>{unit}</span>}
      </div>
    ) : (
      <span className="font-mono text-sm text-slate-700 leading-none">—</span>
    )}
  </div>
);

/** Horizontal rule between sections */
const Divider = () => <div className="border-t border-slate-800/80" />;

// ─── cache badge ─────────────────────────────────────────────────────────────

const CACHE_CONFIG = {
  L1_RAM:  { label: 'L1 RAM',  color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/8' },
  L2_ZARR: { label: 'L2 ZARR', color: 'text-amber-400  border-amber-500/40  bg-amber-500/8'  },
};

const CacheBadge = ({ cache }) => {
  const cfg = CACHE_CONFIG[cache] ?? { label: cache ?? 'LIVE', color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/8' };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-semibold border ${cfg.color}`}>
      ● {cfg.label}
    </span>
  );
};

// ─── section entrance animation ──────────────────────────────────────────────

const Section = ({ children, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, delay, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);

// ─── main component ──────────────────────────────────────────────────────────

export default function PointQueryPanel({ point, onClose, onOpenProfile, onOpenTimeline }) {
  const { selectedDepth, selectedDate, isPlayingTime } = useApp();
  const dispatch = useAppDispatch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  
  // Guard against stale asynchronous responses overwriting newer user selections
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    if (!point) return;
    
    // 1. Suppress fetch entirely while timeline 4D loop is playing
    if (isPlayingTime) return;

    let isMounted = true;
    const currentSeq = ++fetchSeqRef.current;

    // 2. Debounce fetch to prevent API spam while scrubbing depth sliders
    const timeoutId = setTimeout(() => {
      if (!isMounted || currentSeq !== fetchSeqRef.current) return;
      
      setLoading(true);
      setFetchError(null);
      // Deliberately NOT calling setData(null) here so the UI doesn't flash 
      // empty during continuous scrubbing.

      getOceanPoint(point.lat, point.lon, selectedDepth || 0, selectedDate)
        .then((res) => {
          if (!isMounted || currentSeq !== fetchSeqRef.current) return;
          setData(res);
          dispatch({ type: 'SET_ACTIVE_POINT_QUERY', payload: res });
          setLoading(false);
        })
        .catch((err) => {
          if (!isMounted || currentSeq !== fetchSeqRef.current) return;
          console.error('[PointQueryPanel] fetch failed:', err.message);
          setFetchError(err.message);
          setLoading(false);
        });
    }, 400);

    return () => { 
      isMounted = false; 
      clearTimeout(timeoutId);
    };
  }, [point, selectedDepth, selectedDate, isPlayingTime, dispatch]);

  if (!point) return null;

  // ── derived data ────────────────────────────────────────────────────────────
  const phy  = data?.physics ?? {};
  const bgc  = data?.bgc ?? {};
  const argo = data?.nearest_argo_float;
  const info = data?.dataset_info ?? {};

  const speed   = currentSpeed(phy.current_u_ms, phy.current_v_ms);
  const bearing = currentBearing(phy.current_u_ms, phy.current_v_ms);
  const cardinal = toCardinal(bearing);

  const isRecent = info.is_recent;
  const productLabel = info.product_type === 'analysisforecast' ? 'Analysis / Forecast' :
                       info.product_type === 'multiyear' ? 'Multiyear Reanalysis' :
                       info.product_type ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 24, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.97 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="absolute top-20 right-4 z-40 w-[300px] max-h-[calc(100vh-140px)] flex flex-col overflow-hidden rounded-2xl bg-slate-950/98 border border-slate-800 shadow-[0_24px_64px_rgba(0,0,0,0.7)] backdrop-blur-2xl select-none font-sans"
    >
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/25 text-cyan-400">
              <MapPin size={13} />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold text-white uppercase tracking-widest">
                Location Insight
              </div>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wide mt-0.5">
                Scientist · SIH 26067 · INCOIS
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer flex-shrink-0"
          >
            <X size={13} />
          </button>
        </div>

        {/* Query Context */}
        <div className="mt-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-inner">
          <div className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest mb-1.5 flex items-center justify-between">
            <span>Query Context</span>
            {data && <CacheBadge cache={data.cache} />}
          </div>
          
          <div className="space-y-1 text-[11px] font-mono">
            {/* LAT / LON */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">COORD</span>
              <span className="font-semibold text-cyan-300">
                {point.lat >= 0 ? `${point.lat.toFixed(4)}°N` : `${Math.abs(point.lat).toFixed(4)}°S`}
                {'  '}
                {point.lon >= 0 ? `${point.lon.toFixed(4)}°E` : `${Math.abs(point.lon).toFixed(4)}°W`}
              </span>
            </div>
            
            {/* DEPTH */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">DEPTH</span>
              <span className="font-medium text-slate-200">
                {selectedDepth || 0} <span className="text-slate-500 text-[10px]">m</span>
              </span>
            </div>
            
            {/* DATE */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">DATE</span>
              <span className="font-medium text-slate-200">
                {selectedDate || '—'}
              </span>
            </div>
            
            {/* DATASET */}
            <div className="flex items-center justify-between border-t border-slate-800/60 pt-1.5 mt-1.5">
              <span className="text-slate-500">DATASET</span>
              <span className="text-[10px] text-slate-400 truncate ml-2">
                {info.provider ? `${info.provider} · ` : ''}{productLabel ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-slate-800">

        {/* LOADING */}
        {loading && (
          <div className="py-12 flex flex-col items-center gap-3 text-slate-500 text-xs">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 border-2 border-slate-800 rounded-full" />
              <div className="absolute inset-0 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <div className="text-[11px] font-mono text-slate-400">Querying Copernicus & Argo</div>
              <div className="text-[9px] text-slate-600 mt-0.5">Fetching live ocean observations…</div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {!loading && fetchError && (
          <div className="m-4 p-3 rounded-xl bg-red-950/40 border border-red-900/60">
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] font-semibold text-red-300 mb-1">Backend request failed</div>
                <div className="text-[10px] font-mono text-red-500/80 break-all leading-relaxed">{fetchError}</div>
                <div className="text-[9px] text-slate-600 mt-2">
                  Ensure Node gateway (port 3001) and Python backend (port 8000) are running.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DATA ─ rendered only when request succeeded */}
        {!loading && !fetchError && data && (
          <div className="px-4 py-3 space-y-4">

            {/* 1 ── OCEAN CONDITIONS ──────────────────────────────────────── */}
            <Section delay={0.04}>
              <SectionLabel icon={Thermometer} label="Ocean Conditions" accent="text-cyan-500/70" />
              <div className="mt-2 grid grid-cols-2 gap-2">

                {/* Temperature — dominant metric */}
                <div className="col-span-2 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <MetricCell
                    label="Sea Surface Temp."
                    value={fmt(phy.temperature_c)}
                    unit="°C"
                    accent="text-orange-300"
                    size="large"
                  />
                </div>

                {/* Salinity */}
                <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                  <MetricCell
                    label="Salinity"
                    value={fmt(phy.salinity_psu)}
                    unit="PSU"
                    accent="text-sky-300"
                  />
                </div>

                {/* SSH */}
                <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                  <MetricCell
                    label="Sea Level"
                    value={fmt(phy.sea_level_m, 3)}
                    unit="m"
                    accent="text-blue-300"
                  />
                </div>

                {/* Current */}
                <div className="col-span-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wide">Surface Current</span>
                    <div className="flex items-baseline gap-1.5">
                      {speed !== null ? (
                        <>
                          <span className="text-sm font-mono font-bold text-indigo-300">{speed}</span>
                          <span className="text-[9px] text-slate-400 font-mono">m/s</span>
                        </>
                      ) : (
                        <span className="text-sm font-mono text-slate-700">—</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {cardinal !== null && (
                      <>
                        <div className="text-[9px] font-mono text-slate-500 uppercase">Direction</div>
                        <div className="flex items-center gap-1">
                          <Wind size={10} className="text-slate-500" />
                          <span className="text-sm font-mono font-bold text-slate-300">{cardinal}</span>
                          <span className="text-[9px] font-mono text-slate-500">{bearing?.toFixed(0)}°</span>
                        </div>
                      </>
                    )}
                    {hasValue(phy.current_u_ms) && (
                      <div className="text-[9px] font-mono text-slate-600">
                        u {Number(phy.current_u_ms).toFixed(3)} · v {Number(phy.current_v_ms).toFixed(3)}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </Section>

            <Divider />

            {/* 2 ── BIOGEOCHEMISTRY ─────────────────────────────────────── */}
            <Section delay={0.08}>
              <SectionLabel icon={Microscope} label="Biogeochemistry" accent="text-emerald-500/70" />
              <div className="mt-2 grid grid-cols-2 gap-2">

                {/* Chlorophyll-a */}
                <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                  <MetricCell
                    label="Chlorophyll-a"
                    value={fmt(bgc.chlorophyll_mgl, 3)}
                    unit="mg m⁻³"
                    accent="text-emerald-300"
                  />
                </div>

                {/* Dissolved Oxygen */}
                <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                  <MetricCell
                    label="Dissolved O₂"
                    value={fmt(bgc.oxygen_mmolm3, 1)}
                    unit="mmol m⁻³"
                    accent="text-teal-300"
                  />
                </div>

                {/* pH */}
                <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                  <MetricCell
                    label="Ocean pH"
                    value={fmt(bgc.ph, 3)}
                    unit=""
                    accent="text-violet-300"
                  />
                </div>

                {/* pCO₂ */}
                <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                  <MetricCell
                    label="pCO₂"
                    value={fmt(bgc.pco2_uatm, 1)}
                    unit="μatm"
                    accent="text-rose-300"
                  />
                </div>

                {/* Nitrate */}
                {hasValue(bgc.nitrate_mmolm3) && (
                  <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                    <MetricCell
                      label="Nitrate (NO₃)"
                      value={fmt(bgc.nitrate_mmolm3, 2)}
                      unit="mmol m⁻³"
                      accent="text-amber-300"
                    />
                  </div>
                )}

                {/* Phosphate */}
                {hasValue(bgc.phosphate_mmolm3) && (
                  <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
                    <MetricCell
                      label="Phosphate (PO₄)"
                      value={fmt(bgc.phosphate_mmolm3, 3)}
                      unit="mmol m⁻³"
                      accent="text-amber-300"
                    />
                  </div>
                )}

              </div>
            </Section>

            <Divider />

            {/* 3 ── NEAREST ARGO FLOAT ──────────────────────────────────── */}
            {argo && (
              <Section delay={0.12}>
                <SectionLabel icon={Radio} label="Nearest In-Situ Observation" accent="text-emerald-500/70" />
                <div className="mt-2 rounded-xl bg-slate-900 border border-emerald-900/50 overflow-hidden">
                  <div className="px-3 py-2.5 flex items-start justify-between">
                    <div>
                      <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wide">Argo Float</div>
                      <div className="text-sm font-mono font-bold text-white mt-0.5">
                        #{argo.platform_number}
                      </div>
                      <div className="text-[9px] font-mono text-slate-500 mt-1 capitalize">
                        {argo.type ?? 'Core'} Argo
                        {argo.source ? ` · ${argo.source.replace(/_/g, ' ')}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wide">Distance</div>
                      <div className="text-sm font-mono font-bold text-emerald-300 mt-0.5">
                        {argo.distance_km != null ? `${argo.distance_km.toFixed(1)}` : '—'}
                        <span className="text-[9px] font-normal text-slate-500 ml-0.5">km</span>
                      </div>
                      <div className="text-[9px] font-mono text-slate-600 mt-1">
                        {argo.lat != null ? `${argo.lat.toFixed(3)}° · ${argo.lon.toFixed(3)}°` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Sensors */}
                  {argo.available_variables?.length > 0 && (
                    <div className="px-3 py-2 border-t border-slate-800/80 flex flex-wrap gap-1">
                      {argo.available_variables.map((v) => (
                        <span key={v} className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px] font-mono text-slate-400 uppercase border border-slate-700">
                          {v}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Profile button */}
                  <div className="px-3 py-2 border-t border-slate-800/80">
                    <button
                      onClick={() => onOpenProfile?.(argo.platform_number)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/40 text-emerald-300 text-[10px] font-semibold transition-colors border border-emerald-900/60 cursor-pointer"
                    >
                      <span>View Vertical CTD Profile</span>
                      <ArrowUpRight size={11} />
                    </button>
                  </div>
                </div>
                <Divider />
              </Section>
            )}

            {/* 4 ── TIMELINE ACTION ─────────────────────────────────────── */}
            <Section delay={0.16}>
              <button
                onClick={() => onOpenTimeline?.(point)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-950/50 hover:bg-violet-900/40 text-violet-300 text-[11px] font-semibold transition-colors border border-violet-900/60 cursor-pointer"
              >
                <TrendingUp size={12} />
                <span>Plot Multi-Variable Time Series</span>
              </button>
            </Section>

            <Divider />

            {/* 5 ── DATA PROVENANCE ─────────────────────────────────────── */}
            <Section delay={0.2}>
              <SectionLabel icon={Database} label="Data Provenance" accent="text-slate-600" />
              <div className="mt-2 space-y-1.5 text-[9px] font-mono">

                {/* Product type / recency */}
                {productLabel && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Product</span>
                    <span className={`font-semibold ${isRecent ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {productLabel}
                    </span>
                  </div>
                )}

                {/* PHY dataset */}
                {info.phy_dataset && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-600 flex-shrink-0">PHY</span>
                    <span className="text-slate-500 text-right break-all">{info.phy_dataset}</span>
                  </div>
                )}

                {/* BGC dataset */}
                {info.bgc_dataset && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-600 flex-shrink-0">BGC</span>
                    <span className="text-slate-500 text-right break-all">{info.bgc_dataset}</span>
                  </div>
                )}

                {/* Cutoff date */}
                {info.cutoff_date && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">MY Cutoff</span>
                    <span className="text-slate-500">{info.cutoff_date}</span>
                  </div>
                )}

                {/* Elapsed time */}
                {data.elapsed_ms != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Query Time</span>
                    <span className="text-slate-500">{(data.elapsed_ms / 1000).toFixed(2)} s</span>
                  </div>
                )}

                {/* Source attribution */}
                <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-slate-700">
                  <span>Copernicus Marine Service · Argo GDAC</span>
                  <span>SIH-26067</span>
                </div>
              </div>
            </Section>

            {/* bottom breathing room */}
            <div className="h-1" />

          </div>
        )}

      </div>
    </motion.div>
  );
}
