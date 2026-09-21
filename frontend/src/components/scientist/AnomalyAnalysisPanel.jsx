import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Database, Radio, Search } from 'lucide-react';
import { getOceanAnomaly } from '../../services/oceanApi';
import { getArgoProfile, getNearestArgoFloats } from '../../services/argoApi';
import { useApp, useAppDispatch } from '../../context/AppContext';

const hasValue = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));

const formatNumber = (value, decimals = 2) => (
  hasValue(value) ? Number(value).toFixed(decimals) : null
);

const readPath = (obj, path) => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((current, part) => (
    current && current[part] !== undefined ? current[part] : undefined
  ), obj);
};

const firstValue = (obj, paths) => {
  for (const path of paths) {
    const value = readPath(obj, path);
    if (value !== undefined && value !== null) return value;
  }
  return null;
};

const boolValue = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', 'yes', '1', 'anomaly'].includes(value.toLowerCase());
  if (typeof value === 'number') return value !== 0;
  return null;
};

const zDirection = (value) => {
  if (!hasValue(value)) return null;
  const n = Number(value);
  if (n > 0) return 'above historical baseline';
  if (n < 0) return 'below historical baseline';
  return 'near historical baseline';
};

function ResultRow({ label, value, unit, detail }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wide text-slate-500">{label}</div>
        {detail && <div className="mt-0.5 text-[10px] text-slate-500">{detail}</div>}
      </div>
      <div className="text-right font-mono text-sm font-semibold text-slate-100">
        {value ?? <span className="text-slate-600">unavailable</span>}
        {value !== null && value !== undefined && unit && (
          <span className="ml-1 text-[10px] font-normal text-slate-500">{unit}</span>
        )}
      </div>
    </div>
  );
}

function nearestProfileLevel(profile, depth) {
  if (!Array.isArray(profile) || profile.length === 0) return null;
  return profile.reduce((best, row) => {
    const rowDepth = Number(row.depth_m ?? row.depth ?? row.pressure ?? row.depth_dbar);
    if (!Number.isFinite(rowDepth)) return best;
    if (!best) return row;
    const bestDepth = Number(best.depth_m ?? best.depth ?? best.pressure ?? best.depth_dbar);
    return Math.abs(rowDepth - depth) < Math.abs(bestDepth - depth) ? row : best;
  }, null);
}

export default function AnomalyAnalysisPanel({ point }) {
  const { selectedDepth, selectedDate } = useApp();
  const dispatch = useAppDispatch();
  const cacheRef = useRef(new Map());
  const anomalyControllerRef = useRef(null);
  const requestSeqRef = useRef(0);

  const [state, setState] = useState({ status: 'idle', key: null, data: null, error: null });
  const [argoState, setArgoState] = useState({ status: 'idle', key: null, float: null, profile: null, error: null });

  const query = useMemo(() => {
    if (!point || !selectedDate) return null;
    return {
      lat: Number(point.lat),
      lon: Number(point.lon),
      depth: Number(selectedDepth || 0),
      date: selectedDate,
    };
  }, [point, selectedDate, selectedDepth]);

  const queryKey = query
    ? `${query.lat.toFixed(6)}:${query.lon.toFixed(6)}:${query.depth}:${query.date}`
    : null;

  useEffect(() => {
    anomalyControllerRef.current?.abort();
    setState((current) => (
      current.key === queryKey ? current : { status: 'idle', key: queryKey, data: null, error: null }
    ));
    setArgoState({ status: 'idle', key: queryKey, float: null, profile: null, error: null });
    dispatch({ type: 'SET_ACTIVE_ANOMALY_RESULT', payload: null });
  }, [dispatch, queryKey]);

  useEffect(() => () => {
    anomalyControllerRef.current?.abort();
  }, []);

  const runAnomaly = async () => {
    if (!query || !queryKey) return;

    if (cacheRef.current.has(queryKey)) {
      const data = cacheRef.current.get(queryKey);
      setState({ status: 'success', key: queryKey, data, error: null });
      dispatch({ type: 'SET_ACTIVE_ANOMALY_RESULT', payload: { ...data, query } });
      return;
    }

    anomalyControllerRef.current?.abort();
    const controller = new AbortController();
    anomalyControllerRef.current = controller;
    const seq = ++requestSeqRef.current;

    setState({ status: 'loading', key: queryKey, data: null, error: null });
    dispatch({ type: 'SET_ACTIVE_ANOMALY_RESULT', payload: null });

    try {
      const data = await getOceanAnomaly({ ...query, signal: controller.signal });
      if (seq !== requestSeqRef.current) return;
      cacheRef.current.set(queryKey, data);
      setState({ status: 'success', key: queryKey, data, error: null });
      dispatch({ type: 'SET_ACTIVE_ANOMALY_RESULT', payload: { ...data, query } });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (seq !== requestSeqRef.current) return;
      setState({ status: 'error', key: queryKey, data: null, error: error.message });
      dispatch({ type: 'SET_ACTIVE_ANOMALY_RESULT', payload: null });
    }
  };

  const compareWithArgo = async () => {
    if (!query || !queryKey || argoState.status === 'loading') return;

    setArgoState({ status: 'loading', key: queryKey, float: null, profile: null, error: null });
    try {
      const nearest = await getNearestArgoFloats(query.lat, query.lon, 500, 'both', query.date);
      const float = Array.isArray(nearest?.floats) ? nearest.floats[0] : null;
      if (!float?.platform_number) {
        setArgoState({ status: 'empty', key: queryKey, float: null, profile: null, error: null });
        return;
      }

      const profile = await getArgoProfile(float.platform_number, query.date);
      setArgoState({ status: 'success', key: queryKey, float, profile, error: null });
      dispatch({ type: 'SET_ACTIVE_ARGO_PROFILE', payload: profile });
    } catch (error) {
      setArgoState({ status: 'error', key: queryKey, float: null, profile: null, error: error.message });
    }
  };

  if (!query) return null;

  const data = state.status === 'success' && state.key === queryKey ? state.data : null;
  const anomalyFlag = boolValue(firstValue(data, ['anomaly_flag', 'is_anomaly', 'flag']));
  const severity = firstValue(data, ['severity', 'anomaly_severity', 'category']);
  const tempZ = firstValue(data, ['temperature_z', 'temperature_zscore', 'temperature_z_score', 'temp_z', 'temperature.anomaly_z']);
  const chlZ = firstValue(data, ['chlorophyll_z', 'chlorophyll_zscore', 'chlorophyll_z_score', 'chl_z', 'chlorophyll.anomaly_z']);
  const salinityZ = firstValue(data, ['salinity_z', 'salinity_zscore', 'salinity_contribution']);
  const tempBaseline = firstValue(data, [
    'temperature_baseline',
    'historical_temperature',
    'temperature_mean',
    'temperature_climatology_mean',
    'historical_baseline.temperature',
    'historical_baseline.temperature_mean',
    'baseline.temperature',
    'baseline.temperature_mean',
  ]);
  const chlBaseline = firstValue(data, [
    'chlorophyll_baseline',
    'historical_chlorophyll',
    'chlorophyll_mean',
    'chlorophyll_climatology_mean',
    'historical_baseline.chlorophyll',
    'historical_baseline.chlorophyll_mean',
    'baseline.chlorophyll',
    'baseline.chlorophyll_mean',
  ]);

  const locationLabel = `${Math.abs(query.lat).toFixed(3)}${query.lat >= 0 ? 'N' : 'S'}, ${Math.abs(query.lon).toFixed(3)}${query.lon >= 0 ? 'E' : 'W'}`;
  const endpointUnavailable = state.error?.includes('HTTP 404');
  const profileLevel = nearestProfileLevel(argoState.profile?.profile, query.depth);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-cyan-300">
            <Activity size={12} />
            <span>Model / climatology result</span>
          </div>
          <h2 className="mt-1 text-sm font-semibold text-white">Ocean anomaly analysis</h2>
          <p className="mt-1 text-[11px] text-slate-400">
            {locationLabel} | {query.depth} m | {query.date}
          </p>
        </div>
        <button
          type="button"
          onClick={runAnomaly}
          disabled={state.status === 'loading'}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Search size={12} />
          {state.status === 'loading' ? 'Analyzing' : 'Run analysis'}
        </button>
      </div>

      {state.status === 'idle' && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
          Request anomaly analysis for the selected point when you need a climatology comparison.
        </div>
      )}

      {state.status === 'loading' && (
        <div className="mt-3 rounded-lg border border-cyan-900/50 bg-cyan-950/20 px-3 py-3 text-[11px] text-cyan-100">
          <div className="font-mono font-semibold">Analyzing ocean conditions...</div>
          <div className="mt-1 text-cyan-200/70">Checking historical baseline from the ML anomaly service.</div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-3 rounded-lg border border-amber-900/70 bg-amber-950/30 px-3 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
            <div>
              <div className="text-[11px] font-semibold text-amber-200">
                {endpointUnavailable ? 'Waiting for backend endpoint /ocean/anomaly' : 'Anomaly request failed'}
              </div>
              <div className="mt-1 break-words font-mono text-[10px] text-amber-200/70">{state.error}</div>
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="mt-3 space-y-2">
          <div className={`rounded-lg border px-3 py-2 ${
            anomalyFlag === true
              ? 'border-amber-700/60 bg-amber-950/30'
              : 'border-emerald-800/60 bg-emerald-950/20'
          }`}>
            <div className="text-[12px] font-semibold text-white">
              {anomalyFlag === true ? 'Potential anomaly' : 'No significant anomaly detected at this location and time.'}
            </div>
            <div className="mt-1 text-[10px] font-mono text-slate-400">
              Flag: {anomalyFlag === null ? 'unavailable' : String(anomalyFlag)}
              {severity ? ` | Severity: ${severity}` : ''}
            </div>
          </div>

          <ResultRow
            label="Temperature anomaly"
            value={formatNumber(tempZ, 3)}
            unit="z"
            detail={zDirection(tempZ)}
          />
          <ResultRow
            label="Chlorophyll anomaly"
            value={formatNumber(chlZ, 3)}
            unit="z"
            detail={zDirection(chlZ)}
          />
          {salinityZ !== null ? (
            <ResultRow
              label="Salinity anomaly"
              value={formatNumber(salinityZ, 3)}
              unit="z"
              detail={zDirection(salinityZ)}
            />
          ) : (
            <ResultRow
              label="Salinity anomaly"
              value={null}
              detail="Unavailable from current anomaly model"
            />
          )}
          <ResultRow
            label="Historical temperature"
            value={formatNumber(tempBaseline, 3)}
            unit="C"
          />
          <ResultRow
            label="Historical chlorophyll"
            value={formatNumber(chlBaseline, 4)}
            unit="mg/m3"
          />

          {anomalyFlag === true && (
            <div className="rounded-lg border border-emerald-900/60 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-300">
                    <Radio size={12} />
                    <span>Argo observation</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">Nearby Argo observation for neutral model vs observation context.</div>
                </div>
                <button
                  type="button"
                  onClick={compareWithArgo}
                  disabled={argoState.status === 'loading'}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {argoState.status === 'loading' ? 'Comparing' : 'Compare with Argo'}
                </button>
              </div>

              {argoState.status === 'empty' && (
                <div className="mt-2 text-[11px] text-slate-500">No nearby Argo float was returned for this point.</div>
              )}
              {argoState.status === 'error' && (
                <div className="mt-2 break-words font-mono text-[10px] text-amber-300">{argoState.error}</div>
              )}
              {argoState.status === 'success' && (
                <div className="mt-3 space-y-2 text-[11px]">
                  <div className="flex items-center justify-between gap-3 font-mono">
                    <span className="text-slate-500">Float</span>
                    <span className="text-emerald-200">#{argoState.float?.platform_number}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 font-mono">
                    <span className="text-slate-500">Distance</span>
                    <span className="text-slate-200">
                      {hasValue(argoState.float?.distance_km) ? `${Number(argoState.float.distance_km).toFixed(1)} km` : 'unavailable'}
                    </span>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500">
                      <Database size={11} />
                      <span>Model vs observation</span>
                    </div>
                    {profileLevel ? (
                      <div className="space-y-1 font-mono text-slate-300">
                        <div>Observed depth: {formatNumber(profileLevel.depth_m ?? profileLevel.depth ?? profileLevel.depth_dbar, 1) ?? 'unavailable'} m</div>
                        <div>Observed temperature: {formatNumber(profileLevel.temperature_c ?? profileLevel.temperature ?? profileLevel.temp, 3) ?? 'unavailable'} C</div>
                        <div>Observed chlorophyll: {formatNumber(profileLevel.chlorophyll_mgl ?? profileLevel.chlorophyll ?? profileLevel.chla, 4) ?? 'unavailable'} mg/m3</div>
                      </div>
                    ) : (
                      <div className="text-slate-500">Profile data unavailable from the Argo response.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
