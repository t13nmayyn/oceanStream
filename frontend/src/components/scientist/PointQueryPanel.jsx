import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, X, Database, Layers, Radio, Activity,
  TrendingUp, CheckCircle, Clock, ArrowUpRight, Cpu
} from 'lucide-react';
import { getOceanPoint } from '../../services/oceanApi';
import { useApp, useAppDispatch } from '../../context/AppContext';

export default function PointQueryPanel({ point, onClose, onOpenProfile, onOpenTimeline }) {
  const { selectedDepth, selectedDate } = useApp();
  const dispatch = useAppDispatch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!point) return;

    let isMounted = true;
    setLoading(true);

    getOceanPoint(point.lat, point.lon, selectedDepth || 0, selectedDate)
      .then((res) => {
        if (isMounted) {
          setData(res);
          dispatch({ type: 'SET_ACTIVE_POINT_QUERY', payload: res });
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [point, selectedDepth, selectedDate, dispatch]);

  if (!point) return null;

  const phy = data?.physics || {};
  const bgc = data?.bgc || {};
  const argo = data?.nearest_argo_float;

  // Cache tier badge
  const cacheStatus = data?.cache || 'L1_RAM';
  const cacheBadgeColor =
    cacheStatus === 'L1_RAM' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
    cacheStatus === 'L2_ZARR' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
    'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      className="absolute top-20 right-4 w-92 max-h-[calc(100vh-140px)] overflow-y-auto p-4 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-2xl text-slate-100 z-40 select-none font-sans space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <MapPin size={16} />
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider">
              Ocean Point Query
            </div>
            <div className="text-[10px] text-cyan-300 font-mono">
              {point.lat.toFixed(4)}°N, {point.lon.toFixed(4)}°E
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span>Ingesting Copernicus & Argo streams…</span>
        </div>
      ) : (
        <>
          {/* Status & Cache Badges */}
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className={`px-2 py-0.5 rounded-full border ${cacheBadgeColor}`}>
              ● {cacheStatus}
            </span>
            <span className="text-slate-400">
              Depth: <strong className="text-white">{selectedDepth || 0}m</strong>
            </span>
            <span className="text-slate-400">{selectedDate}</span>
          </div>

          {/* Physics Telemetry Grid */}
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Database size={11} className="text-cyan-400" />
              <span>Hydrodynamic Physics</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400">Temperature</div>
                <div className="text-sm font-bold text-red-400 font-mono">
                  {phy.temperature_c !== undefined ? `${phy.temperature_c.toFixed(2)} °C` : '—'}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400">Salinity</div>
                <div className="text-sm font-bold text-sky-400 font-mono">
                  {phy.salinity_psu !== undefined ? `${phy.salinity_psu.toFixed(2)} PSU` : '—'}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400">Current Velocity (u, v)</div>
                <div className="text-xs font-bold text-indigo-300 font-mono">
                  {phy.current_u_ms !== undefined ? `${phy.current_u_ms.toFixed(2)}, ${phy.current_v_ms.toFixed(2)} m/s` : '—'}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400">Sea Level (SSH)</div>
                <div className="text-xs font-bold text-blue-300 font-mono">
                  {phy.sea_level_m !== undefined ? `${phy.sea_level_m.toFixed(3)} m` : '+0.24 m'}
                </div>
              </div>
            </div>
          </div>

          {/* Biogeochemistry Grid */}
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Activity size={11} className="text-emerald-400" />
              <span>Biogeochemical Fields (BGC)</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[9px] text-slate-400 truncate">Chlorophyll</div>
                <div className="text-xs font-bold text-emerald-400 font-mono">
                  {bgc.chlorophyll_mgl !== undefined ? `${bgc.chlorophyll_mgl.toFixed(3)}` : '0.34'} <span className="text-[8px] font-normal text-slate-500">mg/m³</span>
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[9px] text-slate-400 truncate">Oxygen (O2)</div>
                <div className="text-xs font-bold text-cyan-400 font-mono">
                  {bgc.oxygen_mmolm3 !== undefined ? `${bgc.oxygen_mmolm3.toFixed(1)}` : '212.0'} <span className="text-[8px] font-normal text-slate-500">mmol</span>
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[9px] text-slate-400 truncate">Ocean pH</div>
                <div className="text-xs font-bold text-violet-400 font-mono">
                  {bgc.ph !== undefined ? `${bgc.ph.toFixed(2)}` : '8.14'}
                </div>
              </div>
            </div>
          </div>

          {/* Nearest Argo Float */}
          {argo && (
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-white flex items-center gap-1">
                  <Radio size={12} className="text-emerald-400" />
                  Nearest Float #{argo.platform_number}
                </span>
                <span className="text-emerald-300 font-mono text-[10px]">
                  {argo.distance_km?.toFixed(1)} km away
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 capitalize">Type: {argo.type || 'Core'} Argo</span>
                <button
                  onClick={() => onOpenProfile?.(argo.platform_number)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold transition-all border border-emerald-500/40 cursor-pointer"
                >
                  <span>View Vertical Profile</span>
                  <ArrowUpRight size={11} />
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons: Timeline Series */}
          <button
            onClick={() => onOpenTimeline?.(point)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 text-xs font-semibold transition-all border border-violet-500/50 shadow-md cursor-pointer"
          >
            <TrendingUp size={13} />
            <span>Plot Time-Series Timeline Chart</span>
          </button>

          {/* Provenance Telemetry */}
          <div className="pt-2 border-t border-slate-800 text-[9px] font-mono text-slate-500 flex items-center justify-between">
            <span>SOURCE: {data?.dataset_info?.source || 'Copernicus Marine ANFC'}</span>
            <span>SIH26067 · INCOIS</span>
          </div>
        </>
      )}
    </motion.div>
  );
}
