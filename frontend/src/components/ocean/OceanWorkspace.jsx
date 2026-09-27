import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Info, SlidersHorizontal, FlaskConical } from 'lucide-react';
import MapView from '../map/MapView';
import OceanSlab, { DEPTH_BINS } from './OceanSlab';
import TimelineControl from '../scientist/TimelineControl';
import ArgoProfilePanel from '../scientist/ArgoProfilePanel';
import ScientificTimelineChart from '../scientist/ScientificTimelineChart';
import { useApp, useAppDispatch } from '../../context/AppContext';
import useOceanSnapshot, { PREDEFINED_OCEANS } from '../../hooks/useOceanSnapshot';
import useArgoFloats from '../../hooks/useArgoFloats';
import { getOceanCoverage, getOceanVolumeFull } from '../../services/oceanApi';
import { API_BASE } from '../../config/api';


const VARIABLES = [
  ['temperature', 'Water Temperature', '°C'], ['salinity', 'Ocean Saltiness', 'practical salinity'], ['currents', 'Current Vectors', 'metres per second'],
  ['chlorophyll', 'Plankton Density', 'milligrams per cubic metre'], ['oxygen', 'Dissolved Oxygen', 'millimoles per cubic metre'],
  ['ph', 'Acidity (pH)', 'pH scale'], ['nitrate', 'Nutrients (Nitrate)', 'millimoles per cubic metre'], ['pco2', 'Carbon Dioxide', 'microatmospheres'],
];

function selectedValue(point, variable) {
  if (variable === 'currents') {
    if (point?.current_u_ms == null && point?.current_v_ms == null) return NaN;
    return Math.hypot(Number(point?.current_u_ms ?? 0), Number(point?.current_v_ms ?? 0));
  }
  const fields = {
    temperature: 'temperature_c', salinity: 'salinity_psu', chlorophyll: 'chlorophyll_mgl',
    oxygen: 'oxygen_mmolm3', ph: 'ph', nitrate: 'nitrate_mmolm3', pco2: 'pco2_uatm',
  };
  const val = point?.[fields[variable]];
  if (val == null || val === '') return NaN;
  const num = Number(val);
  return Number.isFinite(num) ? num : NaN;
}

function Coverage({ coverage }) {
  return <div className="ocean-coverage"><span>Data Coverage</span>{DEPTH_BINS.map((depth) => <span className="coverage-item" key={depth}><i className={`coverage-dot ${String(coverage?.[depth] || 'NOT_FETCHED').toLowerCase().replace('_', '-')}`} />{depth}m</span>)}</div>;
}

export default function OceanWorkspace({ selectedPoint, onPointClick, showMap = true, bbox, region }) {
  const { userMode, selectedVariable, selectedDepth, selectedDate, heatmapOpacity } = useApp();
  const dispatch = useAppDispatch();
  const activeRegion = bbox || region || selectedPoint || null;
  const {
    volumeData,
    depthSlices,
    gridData,
    floats: snapshotFloats,
    snapshotData,
    source: snapshotSource,
    backupDate,
    dataSource,
    loading: snapshotLoading,
    loadingPhase,
  } = useOceanSnapshot(activeRegion);
  const { floats: argoHookFloats } = useArgoFloats(200);
  const activeFloats = snapshotFloats && snapshotFloats.length > 0 ? snapshotFloats : argoHookFloats;

  const [coverage, setCoverage] = useState(null);
  const [profile, setProfile] = useState(null);
  const [timelinePoint, setTimelinePoint] = useState(null);
  const [openPanel, setOpenPanel] = useState('variables');
  const [previousDepth, setPreviousDepth] = useState(selectedDepth);
  const [hint, setHint] = useState(null);
  const [verticalExaggeration, setVerticalExaggeration] = useState(55);
  const [threshold, setThreshold] = useState({ enabled: false, operator: '>', value: 28, tolerance: 0.05 });
  const [anomalyOn, setAnomalyOn] = useState(false);

  // Phase 1 Visualization Modes & Sensor Toggles
  const [visualizationMode, setVisualizationMode] = useState('subset'); // 'subset' | 'full'
  const [fullVolumeData, setFullVolumeData] = useState(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [fullError, setFullError] = useState(null);
  const [showArgo, setShowArgo] = useState(true);
  const [showGliders, setShowGliders] = useState(true);
  const fullFetchRef = useRef(null);

  // Anomaly volume slices (fetched from /ocean/volume-anomaly when anomalyOn)
  const [anomalySlices, setAnomalySlices] = useState([]);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyModelUsed, setAnomalyModelUsed] = useState(null);
  const anomalyFetchRef = useRef(null);

  const viewport = useMemo(() => {
    if (snapshotData?.bbox) {
      return {
        south: snapshotData.bbox.lat_min,
        north: snapshotData.bbox.lat_max,
        west: snapshotData.bbox.lon_min,
        east: snapshotData.bbox.lon_max,
      };
    }
    if (bbox && bbox.south !== undefined) return bbox;
    if (typeof region === 'string' && PREDEFINED_OCEANS[region]) {
      return PREDEFINED_OCEANS[region];
    }
    return PREDEFINED_OCEANS.indianOcean;
  }, [snapshotData?.bbox, bbox, region]);
  const handleMarkerSelect = useCallback((marker) => {
    setProfile(marker.id || marker.platform_number);
  }, []);

  useEffect(() => {
    if (!viewport) return undefined;
    getOceanCoverage(viewport)
      .then((response) => {
        const states = {};
        DEPTH_BINS.forEach((depth) => {
          const matches = (response.pages || []).filter((page) => {
            const [start, end] = String(page.depth_range || '').split('-').map(Number);
            return Number.isFinite(start) && Number.isFinite(end) && depth >= start && depth <= end;
          });
          const priority = ['FETCHING', 'RESIDENT', 'ON_DISK', 'NOT_FETCHED'];
          states[depth] = priority.find((state) => matches.some((page) => page.state === state)) || 'NOT_FETCHED';
        });
        setCoverage(states);
      })
      .catch(() => setCoverage(null));
  }, [selectedDate, viewport]);

  useEffect(() => {
    if (previousDepth === selectedDepth) return;
    const direction = selectedDepth > previousDepth ? 'down' : 'up';
    setPreviousDepth(selectedDepth);
    setHint(direction === 'down' ? 'Deeper data ready ↓' : 'Shallower data ready ↑');
    const timeout = setTimeout(() => setHint(null), 3600);
    return () => clearTimeout(timeout);
  }, [selectedDepth, previousDepth, viewport]);

  // ── Anomaly data fetch ─────────────────────────────────────────────────────
  // When anomalyOn + viewport available, fetch /ocean/volume-anomaly.
  // Uses debounce + abort so rapid toggles don't stack requests.
  useEffect(() => {
    if (!anomalyOn || !viewport) {
      setAnomalySlices([]);
      setAnomalyLoading(false);
      return undefined;
    }

    // Cancel any in-flight fetch
    if (anomalyFetchRef.current) {
      anomalyFetchRef.current.abort();
    }

    const controller = new AbortController();
    anomalyFetchRef.current = controller;

    const timer = setTimeout(async () => {
      setAnomalyLoading(true);
      try {
        const params = new URLSearchParams({
          lat_min: viewport.south.toFixed(2),
          lat_max: viewport.north.toFixed(2),
          lon_min: viewport.west.toFixed(2),
          lon_max: viewport.east.toFixed(2),
          depths: '0,10,50,100,200,500,1000',
          variable: selectedVariable,
        });
        const res = await fetch(`${API_BASE}/ocean/volume-anomaly?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.depth_slices?.length > 0) {
          setAnomalySlices(data.depth_slices);
          setAnomalyModelUsed(data.model_used || null);
        } else {
          // Fallback: use normal slices but flag anomalyMode — OceanSlab will use statistical z-score
          setAnomalySlices([]);
          setAnomalyModelUsed('statistical_zscore');
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[OceanWorkspace] anomaly fetch error:', err.message);
          setAnomalySlices([]); // OceanSlab falls back to z-score on normal slices
          setAnomalyModelUsed('statistical_zscore');
        }
      } finally {
        setAnomalyLoading(false);
      }
    }, 400); // 400ms debounce

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [anomalyOn, viewport, selectedVariable]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Full Ocean Volume fetch (Phase 1 Full Ocean Mode) ───────────────────────
  useEffect(() => {
    if (visualizationMode !== 'full' || !viewport) {
      return undefined;
    }

    if (fullFetchRef.current) {
      fullFetchRef.current.abort();
    }
    const controller = new AbortController();
    fullFetchRef.current = controller;

    setFullLoading(true);
    setFullError(null);

    getOceanVolumeFull(viewport, selectedDate, selectedVariable)
      .then((data) => {
        if (data && data.depth_slices?.length > 0) {
          setFullVolumeData(data);
        } else {
          setFullError('No full-depth data returned from server');
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('[OceanWorkspace] Full ocean error:', err.message);
          setFullError(err.message);
        }
      })
      .finally(() => {
        setFullLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [visualizationMode, viewport, selectedDate, selectedVariable]);

  const selectVariable = (id) => dispatch({ type: 'SET_SELECTED_VARIABLE', payload: id });
  const setDepth = (value) => dispatch({ type: 'SET_DEPTH', payload: Number(value) });
  const selected = VARIABLES.find(([id]) => id === selectedVariable) || VARIABLES[0];
  const loadedValues = gridData.map((point) => selectedValue(point, selectedVariable)).filter(Number.isFinite);
  const valueMin = loadedValues.length ? Math.min(...loadedValues) : null;
  const valueMax = loadedValues.length ? Math.max(...loadedValues) : null;

  // Active data slices resolution based on Mode
  const isFullMode = visualizationMode === 'full';
  const fullDepthSlices = fullVolumeData?.depth_slices || [];

  const activeDepthSlices = isFullMode && fullDepthSlices.length > 0
    ? fullDepthSlices
    : (anomalyOn && anomalySlices.length > 0 ? anomalySlices : depthSlices);

  const activeMaxDepth = isFullMode
    ? (fullVolumeData?.copernicus_max_depth_m || fullVolumeData?.available_depth_max_m || 5728)
    : 1000;

  const combinedFloats = isFullMode && fullVolumeData?.floats?.length > 0
    ? fullVolumeData.floats
    : activeFloats;

  const effectiveDataSource = isFullMode
    ? (fullVolumeData?.data_source || 'copernicus_zarr')
    : dataSource;

  const effectiveLoadingPhase = fullLoading
    ? 'fetching'
    : loadingPhase;

  const isLoading = snapshotLoading || anomalyLoading || fullLoading;

  // Depth buttons for depth bar (dynamic to full or subset)
  const depthButtons = useMemo(() => {
    if (isFullMode && fullVolumeData?.actual_zarr_depth_levels?.length > 0) {
      const zarrD = fullVolumeData.actual_zarr_depth_levels;
      const candidates = [0, 5, 10, 20, 35, 47, 100, 200, 500, 1000, 2000, 3500, 5728];
      return candidates.filter((d) => d <= activeMaxDepth);
    }
    return [0, 20, 50, 100, 200, 400, 600, 800, 1000];
  }, [isFullMode, fullVolumeData, activeMaxDepth]);

  return <main className={`ocean-workspace ${!showMap ? '!flex !flex-col h-full bg-[#F8FAFC]' : ''}`}>
    {showMap && <section className="ocean-globe-pane"><MapView onPointClick={onPointClick} onSelectFloatForProfile={(id) => setProfile(id)} selectedPoint={selectedPoint} hideSidebar /></section>}
    <section className={`ocean-data-pane flex flex-col min-h-0 ${!showMap ? 'flex-1 !p-5 !bg-[#F8FAFC] text-[#0B1E3D]' : ''}`}>
      {showMap && (
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">{userMode === 'analyze' ? 'Scientific workspace' : 'Public exploration'}</p>
            <h1>{userMode === 'analyze' ? 'Analyze ocean conditions' : 'Explore the ocean'}</h1>
            <p>Choose a region on the globe, then inspect the water column in three dimensions.</p>
          </div>
          <div className="source-note">
            {effectiveDataSource === 'backup_cache'
              ? `📦 Copernicus Backup (${backupDate || 'Stored'})`
              : effectiveDataSource === 'copernicus_zarr'
              ? (isFullMode ? '🟢 Copernicus Full-Depth (L2)' : '🟢 Copernicus Live Analysis')
              : '🌐 Indian Ocean Reference / Demo Field'}
          </div>
        </div>
      )}

      {/* Mode Switcher & Observation Overlays Bar */}
      <div className={`mode-and-toggles-bar flex items-center justify-between flex-wrap gap-2 ${!showMap ? 'mb-2.5 p-2 bg-white rounded-lg border border-[#1C3A63]/20 shadow-xs' : 'mb-2 px-3 py-1.5 bg-[#0B1E3D]/80 border border-[#1C3A63]/50 rounded-lg text-white'}`}>
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#8EA4C8]">3D Ocean</span>
          <div className="inline-flex rounded-lg p-0.5 bg-[#061021] border border-[#1C3A63]/70">
            <button
              type="button"
              onClick={() => setVisualizationMode('subset')}
              className={`px-3 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                visualizationMode === 'subset'
                  ? 'bg-teal-500 text-white shadow-sm'
                  : 'text-[#8EA4C8] hover:text-white'
              }`}
            >
              Subset Mode — Quick Render
            </button>
            <button
              type="button"
              onClick={() => setVisualizationMode('full')}
              className={`px-3 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                visualizationMode === 'full'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-[#8EA4C8] hover:text-white'
              }`}
            >
              Full Ocean Mode
            </button>
          </div>
          {fullLoading && (
            <span className="text-[11px] text-sky-400 animate-pulse font-mono flex items-center gap-1.5 ml-1">
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              Loading full-depth ocean data...
            </span>
          )}
          {fullVolumeData?.partial && isFullMode && (
            <span className="text-[10.5px] text-amber-400 font-mono" title={fullVolumeData.partial_note}>
              ⚠️ {fullVolumeData.n_zarr_depth_levels} Zarr levels (0–{fullVolumeData.available_depth_max_m}m)
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-[11.5px]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#8EA4C8]">Sensors</span>
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[#CBD5E1] hover:text-white font-medium">
            <input
              type="checkbox"
              checked={showArgo}
              onChange={(e) => setShowArgo(e.target.checked)}
              className="accent-teal-400 rounded cursor-pointer"
            />
            <span>Argo Floats</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-[#CBD5E1] hover:text-white font-medium">
            <input
              type="checkbox"
              checked={showGliders}
              onChange={(e) => setShowGliders(e.target.checked)}
              className="accent-sky-400 rounded cursor-pointer"
            />
            <span>Gliders</span>
          </label>
        </div>
      </div>
      
      <div className={`variable-pills flex items-center justify-between ${!showMap ? '!p-0 mb-3' : ''}`} role="tablist" aria-label="Ocean variable">
        <div className="flex items-center flex-wrap gap-2">
          <span className={`control-label ${!showMap ? '!text-[#6B7C96] font-semibold uppercase tracking-wider text-[10px]' : ''}`}>Variable</span>
          {VARIABLES.map(([id, label]) => (
            <button key={id} className={`${selectedVariable === id ? `active ${!showMap ? '!bg-teal-500 !border-teal-500 !text-white' : ''}` : ''} ${!showMap && selectedVariable !== id ? '!bg-white !border-[#1C3A63]/40 !text-[#0B1E3D] hover:!bg-[#F0F4FF] hover:!border-[#1C3A63]' : ''}`} onClick={() => selectVariable(id)}>
              {userMode === 'analyze' ? label : label.replace('Ocean ', '')}
            </button>
          ))}
        </div>
        {!showMap && (
          <button
            type="button"
            onClick={() => setAnomalyOn((v) => !v)}
            aria-pressed={anomalyOn}
            title="Anomaly detection (coming in Phase 3)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors cursor-pointer border ${
              anomalyOn
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-600'
                : 'bg-white border-[#1C3A63]/40 text-[#6B7C96] hover:text-[#0B1E3D] hover:bg-[#F0F4FF] hover:border-[#1C3A63]'
            }`}
          >
            <FlaskConical size={14} />
            Anomaly {anomalyOn ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      <div className={`slab-layout flex-1 min-h-0 flex ${!showMap ? '!border-[#1C3A63]/30 !bg-white rounded-xl overflow-hidden shadow-sm' : ''}`}>
        <div className={`depth-selector-panel flex flex-col items-center justify-between py-3 px-2 ${!showMap ? 'w-24 !bg-[#F8FAFC] border-r border-[#1C3A63]/20' : 'w-24 bg-[#0B1E3D]/90 border-r border-[#1C3A63]/50 text-white'} select-none shrink-0`}>
          <div className="flex flex-col items-center mb-1">
            <span className={`text-[10px] uppercase font-bold tracking-wider ${!showMap ? 'text-[#6B7C96]' : 'text-[#8EA4C8]'}`}>Depth</span>
            <div className="flex items-baseline gap-0.5 mt-0.5">
              <strong className="text-teal-400 font-mono text-[14px] leading-tight font-bold">{selectedDepth}</strong>
              <span className={`text-[10px] font-mono ${!showMap ? 'text-[#6B7C96]' : 'text-[#8EA4C8]'}`}>m</span>
            </div>
          </div>

          {/* Physical Depth Horizon Scale */}
          <div className="flex flex-col gap-1 w-full my-auto overflow-y-auto py-1">
            {depthButtons.map((d) => {
              const isSelected = selectedDepth === d || (selectedDepth >= d - 10 && selectedDepth < d + 15);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDepth(d)}
                  title={`Select ${d}m physical depth`}
                  className={`w-full py-0.5 px-1.5 rounded text-[10.5px] font-mono font-medium transition-all text-center cursor-pointer border ${
                    isSelected
                      ? 'bg-teal-500 text-white border-teal-400 shadow-sm shadow-teal-500/30 font-bold scale-[1.03]'
                      : !showMap
                      ? 'bg-white text-[#0B1E3D] border-[#1C3A63]/20 hover:bg-[#F0F4FF] hover:border-teal-400'
                      : 'bg-[#102A4E] text-[#CBD5E1] border-[#1C3A63]/60 hover:bg-[#1C3A63] hover:text-white'
                  }`}
                >
                  {d === 0 ? '0m' : `${d}m`}
                </button>
              );
            })}
          </div>

          <div className="w-full flex flex-col items-center mt-1 pt-1 border-t border-[#1C3A63]/20">
            <input
              type="range"
              min="0"
              max={activeMaxDepth}
              step={activeMaxDepth > 1000 ? '25' : '10'}
              value={selectedDepth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-400"
              title="Continuous depth scrubbing"
              aria-label="Fine depth scrubbing"
            />
          </div>
        </div>
        <div className={`slab-frame flex-1 relative min-w-0 ${!showMap ? '!h-full' : ''}`}>
          <OceanSlab
            depthSlices={activeDepthSlices}
            volumeData={isFullMode ? fullVolumeData : volumeData}
            grid={gridData}
            floats={combinedFloats}
            showArgo={showArgo}
            showGliders={showGliders}
            visualizationMode={visualizationMode}
            maxDepth={activeMaxDepth}
            variable={selectedVariable}
            depth={selectedDepth}
            dataDepth={snapshotData?.depth ?? selectedDepth}
            bounds={viewport}
            opacity={heatmapOpacity}
            verticalExaggeration={verticalExaggeration}
            threshold={threshold}
            source={snapshotSource}
            dataSource={effectiveDataSource}
            backupDate={backupDate}
            regionName={
              typeof region === 'string'
                ? region
                : (snapshotData?.region_name || bbox?.name || 'Indian Ocean')
            }
            anomalyMode={anomalyOn}
            anomalyThreshold={2.0}
            loading={isLoading}
            loadingPhase={effectiveLoadingPhase}
            onSelectMarker={handleMarkerSelect}
          />
          <div className={`colorbar absolute !top-auto !bottom-4 !right-4 !w-[200px] ${!showMap ? '!bg-white/95 backdrop-blur-md !border-[#1C3A63]/30 !text-[#0B1E3D] rounded-lg shadow-sm' : ''}`}>
            <span className={`${!showMap ? 'font-semibold text-[#0B1E3D]' : ''}`}>{selected[1]}</span>
            <div className={`colorbar-gradient colorbar-${selectedVariable} ${!showMap ? 'rounded' : ''}`} />
            <div className={`colorbar-range ${!showMap ? '!text-[#6B7C96] font-mono text-[10px]' : ''}`}>
              <span>{valueMin === null ? 'no data' : valueMin.toFixed(3)}</span>
              <span>{selected[2]}</span>
              <span>{valueMax === null ? 'no data' : valueMax.toFixed(3)}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className={`${!showMap ? 'text-[#6B7C96]' : ''}`}>
        <Coverage coverage={coverage} />
      </div>
      
      {hint && <div className="slice-notice" role="status">{hint}</div>}
      <div className={`workspace-footer ${!showMap ? '!border-[#1C3A63]/20 pt-4' : ''}`}><TimelineControl /><button className={`panel-toggle ${!showMap ? '!text-[#0B1E3D] !border-[#1C3A63]/30' : ''}`} onClick={() => setOpenPanel(openPanel === 'advanced' ? null : 'advanced')}><SlidersHorizontal size={15} />{userMode === 'analyze' ? 'Advanced controls' : 'About this view'}{openPanel === 'advanced' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button></div>
      {selectedPoint && <button className="timeline-link" onClick={() => setTimelinePoint(selectedPoint)}>Open point timeline</button>}
      {openPanel === 'advanced' && <div className="workspace-drawer">{userMode === 'analyze' ? <><label>Vertical exaggeration<input type="range" min="10" max="60" step="1" value={verticalExaggeration} onChange={(event) => setVerticalExaggeration(Number(event.target.value))} /><strong>{verticalExaggeration}×</strong></label><label>Display opacity<input type="range" min="0.2" max="1" step="0.05" value={heatmapOpacity} onChange={(event) => dispatch({ type: 'SET_HEATMAP_OPACITY', payload: Number(event.target.value) })} /></label><div className="threshold-controls"><label><span>Threshold filter</span><input type="checkbox" checked={threshold.enabled} onChange={(event) => setThreshold({ ...threshold, enabled: event.target.checked })} /></label><select value={threshold.operator} onChange={(event) => setThreshold({ ...threshold, operator: event.target.value })}><option value=">">greater than</option><option value="<">less than</option><option value="=">approximately equal</option></select><input aria-label="Threshold value" type="number" value={threshold.value} onChange={(event) => setThreshold({ ...threshold, value: Number(event.target.value) })} /><span>{selected[2]} · yellow samples: {threshold.enabled ? gridData.filter((point) => { const value = selectedValue(point, selectedVariable); return threshold.operator === '>' ? value > threshold.value : threshold.operator === '<' ? value < threshold.value : Math.abs(value - threshold.value) <= threshold.tolerance; }).length : 0}</span></div><div className="analyze-availability"><span>Model comparison: available via active Argo float profiles.</span><span>3D Volume: active across 0m to 1000m depth stratification.</span></div><p><Info size={14} /> Yellow points match the loaded numerical values. Source: {dataSource === 'backup_cache' ? 'Copernicus Backup Cache' : snapshotData?.source || 'unavailable'}.</p></> : <p><Info size={14} /> Colors represent the selected variable. Click the globe or a marker to inspect a point. Switch to Analyze for units, sources, filters, and raw values.</p>}</div>}
    </section>
    {profile && <ArgoProfilePanel platformNumber={profile} onClose={() => setProfile(null)} />}
    {timelinePoint && <ScientificTimelineChart point={timelinePoint} onClose={() => setTimelinePoint(null)} />}
  </main>;
}
