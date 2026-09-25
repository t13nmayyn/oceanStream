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
  } = useOceanSnapshot(activeRegion);
  const { floats: argoHookFloats } = useArgoFloats(200);
  const activeFloats = snapshotFloats && snapshotFloats.length > 0 ? snapshotFloats : argoHookFloats;

  const [coverage, setCoverage] = useState(null);
  const [profile, setProfile] = useState(null);
  const [timelinePoint, setTimelinePoint] = useState(null);
  const [openPanel, setOpenPanel] = useState('variables');
  const [previousDepth, setPreviousDepth] = useState(selectedDepth);
  const [hint, setHint] = useState(null);
  const [verticalExaggeration, setVerticalExaggeration] = useState(35);
  const [threshold, setThreshold] = useState({ enabled: false, operator: '>', value: 28, tolerance: 0.05 });
  const [anomalyOn, setAnomalyOn] = useState(false);
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
    return null;
  }, [snapshotData?.bbox, bbox]);
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
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">{userMode === 'analyze' ? 'Scientific workspace' : 'Public exploration'}</p>
            <h1>{userMode === 'analyze' ? 'Analyze ocean conditions' : 'Explore the ocean'}</h1>
            <p>Choose a region on the globe, then inspect the water column in three dimensions.</p>
          </div>
          <div className="source-note">
            {dataSource === 'backup_cache'
              ? `📦 Copernicus Backup (${backupDate || 'Stored'})`
              : dataSource === 'copernicus_zarr'
              ? '🟢 Copernicus Live Analysis'
              : '🌐 Indian Ocean Reference / Demo Field'}
          </div>
        </div>
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
        <div className={`depth-selector-panel flex flex-col items-center justify-between py-3 px-2 ${!showMap ? 'w-24 !bg-[#F8FAFC] border-r border-[#1C3A63]/20' : 'w-24 bg-[#0B1E3D]/90 border-r border-[#1C3A63]/50 text-white'} select-none shrink-0`}>
          <div className="flex flex-col items-center mb-1">
            <span className={`text-[10px] uppercase font-bold tracking-wider ${!showMap ? 'text-[#6B7C96]' : 'text-[#8EA4C8]'}`}>Depth</span>
            <div className="flex items-baseline gap-0.5 mt-0.5">
              <strong className="text-teal-400 font-mono text-[14px] leading-tight font-bold">{selectedDepth}</strong>
              <span className={`text-[10px] font-mono ${!showMap ? 'text-[#6B7C96]' : 'text-[#8EA4C8]'}`}>m</span>
            </div>
          </div>

          {/* Physical Depth Horizon Scale: 0m · 20m · 50m · 100m · 200m · 400m · 600m · 800m · 1000m */}
          <div className="flex flex-col gap-1 w-full my-auto overflow-y-auto py-1">
            {[0, 20, 50, 100, 200, 400, 600, 800, 1000].map((d) => {
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
              max="1000"
              step="10"
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
            depthSlices={depthSlices}
            volumeData={volumeData}
            grid={gridData}
            floats={activeFloats}
            variable={selectedVariable}
            depth={selectedDepth}
            dataDepth={snapshotData?.depth ?? selectedDepth}
            bounds={viewport}
            opacity={heatmapOpacity}
            verticalExaggeration={verticalExaggeration}
            threshold={threshold}
            source={snapshotSource}
            dataSource={dataSource}
            backupDate={backupDate}
            regionName={typeof region === 'string' ? region : 'Indian Ocean'}
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
