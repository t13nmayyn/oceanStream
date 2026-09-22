import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info, SlidersHorizontal, FlaskConical } from 'lucide-react';
import MapView from '../map/MapView';
import OceanSlab, { DEPTH_BINS } from './OceanSlab';
import TimelineControl from '../scientist/TimelineControl';
import ArgoProfilePanel from '../scientist/ArgoProfilePanel';
import ScientificTimelineChart from '../scientist/ScientificTimelineChart';
import { useApp, useAppDispatch } from '../../context/AppContext';
import useOceanSnapshot from '../../hooks/useOceanSnapshot';
import useArgoFloats from '../../hooks/useArgoFloats';
import { getOceanCoverage } from '../../services/oceanApi';

const VARIABLES = [
  ['temperature', 'Water Temperature', '°C'], ['salinity', 'Ocean Saltiness', 'practical salinity'], ['currents', 'Current Vectors', 'metres per second'],
  ['chlorophyll', 'Plankton Density', 'milligrams per cubic metre'], ['oxygen', 'Dissolved Oxygen', 'millimoles per cubic metre'],
  ['ph', 'Acidity (pH)', 'pH scale'], ['nitrate', 'Nutrients (Nitrate)', 'millimoles per cubic metre'], ['pco2', 'Carbon Dioxide', 'microatmospheres'],
];

function selectedValue(point, variable) {
  if (variable === 'currents') return Math.hypot(Number(point.current_u_ms ?? 0), Number(point.current_v_ms ?? 0));
  const fields = {
    temperature: 'temperature_c', salinity: 'salinity_psu', chlorophyll: 'chlorophyll_mgl',
    oxygen: 'oxygen_mmolm3', ph: 'ph', nitrate: 'nitrate_mmolm3', pco2: 'pco2_uatm',
  };
  return Number(point[fields[variable]]);
}

function Coverage({ coverage }) {
  return <div className="ocean-coverage"><span>Data Coverage</span>{DEPTH_BINS.map((depth) => <span className="coverage-item" key={depth}><i className={`coverage-dot ${String(coverage?.[depth] || 'NOT_FETCHED').toLowerCase().replace('_', '-')}`} />{depth}m</span>)}</div>;
}

export default function OceanWorkspace({ selectedPoint, onPointClick, showMap = true }) {
  const { userMode, selectedVariable, selectedDepth, selectedDate, heatmapOpacity } = useApp();
  const dispatch = useAppDispatch();
  const { gridData, snapshotData } = useOceanSnapshot('indianOcean');
  const { floats } = useArgoFloats(200);
  const [coverage, setCoverage] = useState(null);
  const [profile, setProfile] = useState(null);
  const [timelinePoint, setTimelinePoint] = useState(null);
  const [openPanel, setOpenPanel] = useState('variables');
  const [previousDepth, setPreviousDepth] = useState(selectedDepth);
  const [hint, setHint] = useState(null);
  const [verticalExaggeration, setVerticalExaggeration] = useState(1);
  const [threshold, setThreshold] = useState({ enabled: false, operator: '>', value: 28, tolerance: 0.05 });
  const [anomalyOn, setAnomalyOn] = useState(false);
  const viewport = useMemo(() => snapshotData?.bbox ? {
    south: snapshotData.bbox.lat_min,
    north: snapshotData.bbox.lat_max,
    west: snapshotData.bbox.lon_min,
    east: snapshotData.bbox.lon_max,
  } : null, [snapshotData?.bbox]);
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

  const selectVariable = (id) => dispatch({ type: 'SET_SELECTED_VARIABLE', payload: id });
  const setDepth = (value) => dispatch({ type: 'SET_DEPTH', payload: Number(value) });
  const selected = VARIABLES.find(([id]) => id === selectedVariable) || VARIABLES[0];
  const loadedValues = gridData.map((point) => selectedValue(point, selectedVariable)).filter(Number.isFinite);
  const valueMin = loadedValues.length ? Math.min(...loadedValues) : null;
  const valueMax = loadedValues.length ? Math.max(...loadedValues) : null;

  return <main className={`ocean-workspace ${!showMap ? '!flex !flex-col h-full bg-[#F8FAFC]' : ''}`}>
    {showMap && <section className="ocean-globe-pane"><MapView onPointClick={onPointClick} onSelectFloatForProfile={(id) => setProfile(id)} selectedPoint={selectedPoint} hideSidebar /></section>}
    <section className={`ocean-data-pane flex flex-col min-h-0 ${!showMap ? 'flex-1 !p-5 !bg-[#F8FAFC] text-[#0B1E3D]' : ''}`}>
      {showMap && (
        <div className="workspace-heading"><div><p className="eyebrow">{userMode === 'analyze' ? 'Scientific workspace' : 'Public exploration'}</p><h1>{userMode === 'analyze' ? 'Analyze ocean conditions' : 'Explore the ocean'}</h1><p>Choose a region on the globe, then inspect the water column in three dimensions.</p></div><div className="source-note">{snapshotData?.source || 'Model and observation data'}</div></div>
      )}
      
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
        <label className={`depth-control flex flex-col items-center justify-center py-4 px-2 ${!showMap ? 'w-16 !bg-[#F8FAFC] border-r border-[#1C3A63]/20' : ''}`}>
          <span className={`${!showMap ? 'text-[10px] uppercase font-bold text-[#6B7C96] tracking-wider mb-2' : ''}`}>{!showMap ? 'Depth' : 'Explore Depth'}</span>
          <strong className={`${!showMap ? '!text-teal-600 font-mono text-[12px] mb-4' : ''}`}>{selectedDepth}m</strong>
          <input type="range" min="0" max="1000" step="10" value={selectedDepth} onChange={(event) => setDepth(event.target.value)} className={`${!showMap ? '!h-[200px]' : ''}`} />
        </label>
        <div className={`slab-frame flex-1 relative min-w-0 ${!showMap ? '!h-full' : ''}`}>
          <OceanSlab grid={gridData} floats={floats} variable={selectedVariable} depth={selectedDepth} dataDepth={snapshotData?.depth ?? selectedDepth} bounds={viewport} opacity={heatmapOpacity} verticalExaggeration={verticalExaggeration} threshold={threshold} onSelectMarker={handleMarkerSelect} />
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
      {openPanel === 'advanced' && <div className="workspace-drawer">{userMode === 'analyze' ? <><label>Vertical exaggeration<input type="range" min="0.5" max="4" step="0.1" value={verticalExaggeration} onChange={(event) => setVerticalExaggeration(Number(event.target.value))} /><strong>{verticalExaggeration.toFixed(1)}×</strong></label><label>Display opacity<input type="range" min="0.2" max="1" step="0.05" value={heatmapOpacity} onChange={(event) => dispatch({ type: 'SET_HEATMAP_OPACITY', payload: Number(event.target.value) })} /></label><div className="threshold-controls"><label><span>Threshold filter</span><input type="checkbox" checked={threshold.enabled} onChange={(event) => setThreshold({ ...threshold, enabled: event.target.checked })} /></label><select value={threshold.operator} onChange={(event) => setThreshold({ ...threshold, operator: event.target.value })}><option value=">">greater than</option><option value="<">less than</option><option value="=">approximately equal</option></select><input aria-label="Threshold value" type="number" value={threshold.value} onChange={(event) => setThreshold({ ...threshold, value: Number(event.target.value) })} /><span>{selected[2]} · yellow samples: {threshold.enabled ? gridData.filter((point) => { const value = selectedValue(point, selectedVariable); return threshold.operator === '>' ? value > threshold.value : threshold.operator === '<' ? value < threshold.value : Math.abs(value - threshold.value) <= threshold.tolerance; }).length : 0}</span></div><div className="analyze-availability"><span>Model comparison: unavailable until a measured observation profile is returned.</span><span>Isosurface and volume: unavailable because /ocean/snapshot supplies one 2D depth slice.</span></div><p><Info size={14} /> Yellow points match the loaded numerical values. Source: {snapshotData?.source || 'unavailable'}.</p></> : <p><Info size={14} /> Colors represent the selected variable. Click the globe or a marker to inspect a point. Switch to Analyze for units, sources, filters, and raw values.</p>}</div>}
    </section>
    {profile && <ArgoProfilePanel platformNumber={profile} onClose={() => setProfile(null)} />}
    {timelinePoint && <ScientificTimelineChart point={timelinePoint} onClose={() => setTimelinePoint(null)} />}
  </main>;
}
