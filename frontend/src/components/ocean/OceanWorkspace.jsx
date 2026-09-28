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
import { getOceanCoverage, getOceanVolumeFull, getOceanDepthLevels } from '../../services/oceanApi';
import { API_BASE } from '../../config/api';


const ALL_VARIABLES = [
  ['temperature', 'Water Temperature', '°C'],
  ['salinity', 'Ocean Saltiness', 'practical salinity'],
  ['currents', 'Current Vectors', 'metres per second'],
  ['chlorophyll', 'Plankton Density', 'mg/m³'],
  ['oxygen', 'Dissolved Oxygen', 'mmol/m³'],
  ['ph', 'Acidity (pH)', 'pH scale'],
  ['nitrate', 'Nutrients (Nitrate)', 'mmol/m³'],
  ['pco2', 'Carbon Dioxide', 'μatm'],
];

const VARIABLES = ALL_VARIABLES;

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

  // Native depth array from /ocean/depth-levels (Phase 4)
  const [depthLevelsInfo, setDepthLevelsInfo] = useState(null);

  // Variable Checkboxes for Temp & Salinity (Phase 5)
  const [tempChecked, setTempChecked] = useState(true);
  const [salChecked, setSalChecked] = useState(false);

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

  // Fetch native depth levels on startup
  useEffect(() => {
    getOceanDepthLevels()
      .then((data) => {
        if (data && data.native_depths) {
          setDepthLevelsInfo(data);
        }
      })
      .catch((err) => console.warn('[OceanWorkspace] getOceanDepthLevels error:', err));
  }, []);

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
  useEffect(() => {
    if (!anomalyOn || !viewport) {
      setAnomalySlices([]);
      setAnomalyLoading(false);
      return undefined;
    }

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
          setAnomalySlices([]);
          setAnomalyModelUsed('statistical_zscore');
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[OceanWorkspace] anomaly fetch error:', err.message);
          setAnomalySlices([]);
          setAnomalyModelUsed('statistical_zscore');
        }
      } finally {
        setAnomalyLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [anomalyOn, viewport, selectedVariable]);


  // ── Full Ocean Volume fetch (Phase 1 & 4 Full Ocean Mode) — Progressive Tiling ─────
  // Tiles the viewport into ≤15° chunks, fetches each tile independently, merges on arrival.
  // Renders whatever is ON_DISK immediately — never blocks on the full globe.
  useEffect(() => {
    if (visualizationMode !== 'full' || !viewport) {
      return undefined;
    }

    // Abort any in-flight tile fetches
    if (fullFetchRef.current) {
      fullFetchRef.current.abort();
    }
    const controller = new AbortController();
    fullFetchRef.current = controller;

    setFullLoading(true);
    setFullError(null);
    setFullVolumeData(null);

    const TILE_DEG = 15; // max tile size per axis (degrees)
    const { south, north, west, east } = viewport;

    // Build lat tiles
    const latTiles = [];
    for (let lat = south; lat < north; lat += TILE_DEG) {
      latTiles.push([lat, Math.min(lat + TILE_DEG, north)]);
    }

    // Build lon tiles (antimeridian-aware)
    const lonTiles = [];
    const isAntimeridian = west > east;
    if (isAntimeridian) {
      // Western half: west..180
      for (let lon = west; lon < 180; lon += TILE_DEG) {
        lonTiles.push([lon, Math.min(lon + TILE_DEG, 180)]);
      }
      // Eastern half: -180..east
      for (let lon = -180; lon < east; lon += TILE_DEG) {
        lonTiles.push([lon, Math.min(lon + TILE_DEG, east)]);
      }
    } else {
      for (let lon = west; lon < east; lon += TILE_DEG) {
        lonTiles.push([lon, Math.min(lon + TILE_DEG, east)]);
      }
    }

    // All tiles
    const tiles = [];
    for (const [latMin, latMax] of latTiles) {
      for (const [lonMin, lonMax] of lonTiles) {
        tiles.push({ latMin, latMax, lonMin, lonMax });
      }
    }

    // Merged depth-slice accumulator: key = depth_m string
    const mergedSlicesMap = new Map();
    let mergedBathyGrid = null, mergedBathyLats = null, mergedBathyLons = null;
    let mergedMaxDepth = 5727.917;
    let mergedNativeDepths = null;
    let tilesCompleted = 0;
    const totalTiles = tiles.length;

    function getMergedData() {
      const slicesArr = [...mergedSlicesMap.values()]
        .map((s) => ({ ...s }))
        .sort((a, b) => a.depth_m - b.depth_m);
      return {
        source: 'copernicus_zarr',
        depth_slices: slicesArr,
        layers: slicesArr,
        bathymetry: mergedBathyGrid || [],
        bathymetry_lats: mergedBathyLats || [],
        bathymetry_lons: mergedBathyLons || [],
        max_depth_m: mergedMaxDepth,
        native_depths: mergedNativeDepths || [],
        native_depth_count: (mergedNativeDepths || []).length,
        bbox: { lat_min: south, lat_max: north, lon_min: west, lon_max: east },
        variables: ['temperature', 'salinity', 'u_current', 'v_current'],
      };
    }

    function mergeSlices(tileData, tile) {
      if (!tileData?.depth_slices?.length && !tileData?.layers?.length) return;
      const slices = tileData.depth_slices || tileData.layers || [];

      slices.forEach((slice) => {
        const key = String(slice.depth_m ?? slice.depth ?? 0);
        const pts = (slice.points || []).filter((p) => p && p.lat != null && p.lon != null);
        if (!pts.length) return;
        if (!mergedSlicesMap.has(key)) {
          mergedSlicesMap.set(key, { depth_m: Number(key), points: [], source: slice.source });
        }
        const existing = mergedSlicesMap.get(key);
        existing.points.push(...pts);
      });

      // Merge bathymetry from this tile (simple accumulation)
      if (!mergedBathyGrid && tileData.bathymetry?.length > 0 && tileData.bathymetry_lats?.length > 0) {
        mergedBathyGrid = tileData.bathymetry;
        mergedBathyLats = tileData.bathymetry_lats;
        mergedBathyLons = tileData.bathymetry_lons;
      }
      if (tileData.max_depth_m && tileData.max_depth_m > mergedMaxDepth) {
        mergedMaxDepth = tileData.max_depth_m;
      }
      if (!mergedNativeDepths && tileData.native_depths?.length) {
        mergedNativeDepths = tileData.native_depths;
      }
    }


    async function fetchTile(tile) {
      if (controller.signal.aborted) return;
      try {
        const params = new URLSearchParams({
          lat_min: tile.latMin.toFixed(2),
          lat_max: tile.latMax.toFixed(2),
          lon_min: tile.lonMin.toFixed(2),
          lon_max: tile.lonMax.toFixed(2),
          variable: selectedVariable || 'temperature',
        });
        const res = await fetch(`${API_BASE}/ocean/volume-full?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        mergeSlices(data, tile);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn(`[OceanWorkspace] tile fetch error ${tile.latMin},${tile.lonMin}:`, err.message);
        }
      } finally {
        tilesCompleted += 1;
        // Push progressive update to UI after each tile (debounced by React batching)
        if (!controller.signal.aborted && mergedSlicesMap.size > 0) {
          setFullVolumeData({ ...getMergedData(), _tileProgress: tilesCompleted / totalTiles });
          if (tilesCompleted === 1) setFullLoading(false); // show first data quickly
        }
        if (tilesCompleted >= totalTiles) {
          setFullLoading(false);
        }
      }
    }

    // Fetch all tiles concurrently (browser limits to ~6 parallel)
    Promise.allSettled(tiles.map(fetchTile)).then(() => {
      if (!controller.signal.aborted) {
        if (mergedSlicesMap.size === 0) {
          setFullError('No data available for this region. Background fetch in progress.');
        }
        setFullLoading(false);
      }
    });

    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const nativeDepths = depthLevelsInfo?.native_depths || fullVolumeData?.native_depths || fullVolumeData?.actual_zarr_depth_levels || [];
  const nativeDepthCount = depthLevelsInfo?.native_depth_count || fullVolumeData?.native_depth_count || (nativeDepths.length > 0 ? nativeDepths.length : 50);
  const nativeMaxDepth = depthLevelsInfo?.max_depth_m || fullVolumeData?.max_depth_m || 5727.9;

  const combinedFloats = isFullMode && fullVolumeData?.floats?.length > 0
    ? fullVolumeData.floats
    : activeFloats;

  const effectiveDataSource = isFullMode
    ? (fullVolumeData?.source || fullVolumeData?.data_source || 'demo_full_depth')
    : dataSource;

  const effectiveLoadingPhase = fullLoading
    ? 'fetching'
    : loadingPhase;

  const isLoading = snapshotLoading || anomalyLoading || fullLoading;

  // Dynamically generated depth buttons from real native depth array:
  // Show every level from 0–200m (closely spaced), then every 5th level from 200m downward
  const depthButtons = useMemo(() => {
    if (nativeDepths && nativeDepths.length > 0) {
      const shallow = nativeDepths.filter((d) => d <= 200);
      const deep = nativeDepths.filter((d) => d > 200).filter((_, idx) => idx % 5 === 0);
      const lastDepth = nativeDepths[nativeDepths.length - 1];
      const combined = [...shallow, ...deep];
      if (!combined.includes(lastDepth)) combined.push(lastDepth);
      return combined;
    }
    return [0, 20, 50, 100, 200, 400, 600, 800, 1000];
  }, [nativeDepths]);

  // Available variables from response
  const availableVars = useMemo(() => {
    const list = isFullMode
      ? (fullVolumeData?.variables || ['temperature', 'salinity', 'u_current', 'v_current', 'currents'])
      : (volumeData?.variables || ['temperature', 'salinity', 'currents']);
    const set = new Set(list);
    if (set.has('u_current') || set.has('v_current')) set.add('currents');
    return set;
  }, [isFullMode, fullVolumeData, volumeData]);

  // Determine effective variable passed to OceanSlab
  const effectiveSlabVariable = tempChecked && salChecked
    ? 'temperature'
    : (tempChecked ? 'temperature' : (salChecked ? 'salinity' : selectedVariable));

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
          <div className="source-note flex items-center gap-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-sky-950/70 border border-sky-600/40 text-sky-300">
              Native depth levels: {nativeDepthCount} · Max depth: {nativeMaxDepth < 1000 ? nativeMaxDepth : Number(nativeMaxDepth).toFixed(1)}m
            </span>
            {effectiveDataSource === 'backup_cache'
              ? `📦 Copernicus Backup (${backupDate || 'Stored'})`
              : effectiveDataSource === 'demo_full_depth' || (isFullMode && effectiveDataSource === 'copernicus_zarr')
              ? '🟢 Copernicus Full-Depth (L2)'
              : effectiveDataSource === 'copernicus_zarr'
              ? '🟢 Copernicus Live Analysis'
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
              Loading 50 native depth layers & bathymetry...
            </span>
          )}
          {isFullMode && (
            <span className="text-[10.5px] text-sky-300 font-mono">
              🌊 50 Native Layers (0.494–{Number(nativeMaxDepth).toFixed(1)}m) · Seafloor Masked
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
      
      {/* Variable Controls: Checkboxes for Temp & Salinity, Pills for remainder (Phase 5) */}
      <div className={`variable-pills flex items-center justify-between flex-wrap gap-2 ${!showMap ? '!p-0 mb-3' : 'mb-2'}`} role="tablist" aria-label="Ocean variable">
        <div className="flex items-center flex-wrap gap-2">
          <span className={`control-label ${!showMap ? '!text-[#6B7C96] font-semibold uppercase tracking-wider text-[10px]' : 'text-[#8EA4C8] text-[10px] uppercase font-bold tracking-wider'}`}>Variables</span>

          {/* Temperature Checkbox */}
          <label className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold cursor-pointer border select-none transition-all ${
            tempChecked
              ? 'bg-teal-500/25 text-teal-300 border-teal-400 shadow-xs'
              : 'bg-[#0B1E3D]/50 text-[#8EA4C8] border-[#1C3A63]/50 hover:text-white'
          }`}>
            <input
              type="checkbox"
              checked={tempChecked}
              onChange={(e) => {
                const checked = e.target.checked;
                if (!checked && !salChecked) return;
                setTempChecked(checked);
                if (checked) {
                  selectVariable('temperature');
                } else if (salChecked) {
                  selectVariable('salinity');
                }
              }}
              className="accent-teal-400 rounded cursor-pointer"
            />
            <span>Temperature</span>
          </label>

          {/* Salinity Checkbox */}
          <label className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold cursor-pointer border select-none transition-all ${
            salChecked
              ? 'bg-purple-500/25 text-purple-300 border-purple-400 shadow-xs'
              : 'bg-[#0B1E3D]/50 text-[#8EA4C8] border-[#1C3A63]/50 hover:text-white'
          }`}>
            <input
              type="checkbox"
              checked={salChecked}
              onChange={(e) => {
                const checked = e.target.checked;
                if (!checked && !tempChecked) return;
                setSalChecked(checked);
                if (checked) {
                  if (!tempChecked) selectVariable('salinity');
                } else if (tempChecked) {
                  selectVariable('temperature');
                }
              }}
              className="accent-purple-400 rounded cursor-pointer"
            />
            <span>Salinity</span>
          </label>

          {/* Pills for other variables (greyed out if not available) */}
          {ALL_VARIABLES.filter(([id]) => id !== 'temperature' && id !== 'salinity').map(([id, label]) => {
            const isAvailable = availableVars.has(id);
            const isActive = !tempChecked && !salChecked && selectedVariable === id;
            return (
              <button
                key={id}
                type="button"
                disabled={!isAvailable}
                title={!isAvailable ? 'Not available in this dataset.' : (userMode === 'analyze' ? label : label.replace('Ocean ', ''))}
                onClick={() => {
                  if (!isAvailable) return;
                  setTempChecked(false);
                  setSalChecked(false);
                  selectVariable(id);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all border cursor-pointer ${
                  !isAvailable
                    ? 'opacity-35 cursor-not-allowed bg-[#0B1E3D]/20 text-gray-400 border-gray-700/30'
                    : isActive
                    ? 'bg-sky-500 text-white border-sky-400 shadow-xs'
                    : 'bg-[#0B1E3D]/50 text-[#8EA4C8] border-[#1C3A63]/50 hover:text-white hover:border-[#1C3A63]'
                }`}
              >
                {userMode === 'analyze' ? label : label.replace('Ocean ', '')}
              </button>
            );
          })}
        </div>
        {!showMap && (
          <button
            type="button"
            onClick={() => setAnomalyOn((v) => !v)}
            aria-pressed={anomalyOn}
            title="Anomaly detection"
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
          <div className="flex flex-col items-center mb-1 text-center w-full">
            <span className={`text-[10px] uppercase font-bold tracking-wider ${!showMap ? 'text-[#6B7C96]' : 'text-[#8EA4C8]'}`}>Depth</span>
            <div className="flex items-baseline gap-0.5 mt-0.5">
              <strong className="text-teal-400 font-mono text-[14px] leading-tight font-bold">
                {selectedDepth < 1 ? Number(selectedDepth).toFixed(2) : Math.round(selectedDepth)}
              </strong>
              <span className={`text-[10px] font-mono ${!showMap ? 'text-[#6B7C96]' : 'text-[#8EA4C8]'}`}>m</span>
            </div>
          </div>

          {/* Physical Depth Horizon Scale: dynamically populated from native depth levels */}
          <div className="flex flex-col gap-1 w-full my-auto overflow-y-auto py-1 max-h-[360px]">
            {depthButtons.map((d) => {
              const dNum = Number(d);
              const isSelected = Math.abs(selectedDepth - dNum) < (dNum < 10 ? 0.8 : dNum < 200 ? 12 : 120);
              const label = dNum < 1 ? `${dNum.toFixed(1)}m` : `${Math.round(dNum)}m`;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDepth(dNum)}
                  title={`Fly camera to ${label} depth level`}
                  className={`w-full py-0.5 px-1 rounded text-[10px] font-mono font-medium transition-all text-center cursor-pointer border ${
                    isSelected
                      ? 'bg-teal-500 text-white border-teal-400 shadow-sm shadow-teal-500/30 font-bold scale-[1.03]'
                      : !showMap
                      ? 'bg-white text-[#0B1E3D] border-[#1C3A63]/20 hover:bg-[#F0F4FF] hover:border-teal-400'
                      : 'bg-[#102A4E] text-[#CBD5E1] border-[#1C3A63]/60 hover:bg-[#1C3A63] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="w-full flex flex-col items-center mt-1 pt-1 border-t border-[#1C3A63]/20">
            <input
              type="range"
              min="0"
              max={nativeMaxDepth}
              step={nativeMaxDepth > 1000 ? '25' : '10'}
              value={selectedDepth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-400"
              title="Continuous depth scrubbing"
              aria-label="Fine depth scrubbing"
            />
          </div>
        </div>
        <div className={`slab-frame flex-1 relative min-w-0 ${!showMap ? '!h-full' : ''}`}>
          {/* ── Skeleton loading overlay — visible while data is fetching ── */}
          {isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#050b16]/90 backdrop-blur-md transition-all duration-500 select-none">
              {/* Animated holographic ocean depth column */}
              <div className="flex flex-col items-center gap-5 max-w-sm px-6 py-7 rounded-2xl border border-teal-500/20 bg-[#061426]/90 shadow-2xl shadow-teal-950/40">
                {/* 3D Wireframe Depth Planes Skeleton */}
                <div className="relative w-40 h-28 flex flex-col items-center justify-center">
                  {/* Layer 1 - Surface plane */}
                  <div
                    className="absolute w-32 h-10 rounded-lg border border-teal-400/50 bg-gradient-to-r from-teal-500/10 via-cyan-400/20 to-teal-500/10 transform -rotate-12 skew-x-12 animate-pulse shadow-sm shadow-teal-400/20"
                    style={{ top: '6px', animationDuration: '2.2s' }}
                  >
                    <div className="absolute inset-0 grid grid-cols-4 grid-rows-2 opacity-30 border border-teal-300/40" />
                  </div>

                  {/* Layer 2 - Thermocline plane */}
                  <div
                    className="absolute w-28 h-9 rounded-lg border border-sky-400/40 bg-gradient-to-r from-sky-500/10 via-blue-400/15 to-sky-500/10 transform -rotate-12 skew-x-12 animate-pulse"
                    style={{ top: '34px', animationDuration: '2.2s', animationDelay: '0.35s' }}
                  >
                    <div className="absolute inset-0 grid grid-cols-4 grid-rows-2 opacity-25 border border-sky-300/30" />
                  </div>

                  {/* Layer 3 - Abyssal plane */}
                  <div
                    className="absolute w-24 h-8 rounded-lg border border-indigo-400/30 bg-gradient-to-r from-indigo-500/10 via-purple-400/15 to-indigo-500/10 transform -rotate-12 skew-x-12 animate-pulse"
                    style={{ top: '62px', animationDuration: '2.2s', animationDelay: '0.7s' }}
                  >
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 opacity-20 border border-indigo-300/30" />
                  </div>

                  {/* Vertical Depth Struts connecting planes */}
                  <div className="absolute w-[2px] h-16 bg-gradient-to-b from-teal-400/50 via-sky-400/30 to-indigo-500/20 left-10 top-5" />
                  <div className="absolute w-[2px] h-16 bg-gradient-to-b from-teal-400/50 via-sky-400/30 to-indigo-500/20 right-10 top-5" />

                  {/* Pulsing Sonar Node */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-teal-400/80 shadow-lg shadow-teal-400/60 animate-ping" style={{ animationDuration: '1.8s' }} />
                </div>

                {/* Status text with micro-step indicator */}
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                    <span className="text-teal-300 font-semibold text-[13px] tracking-wide font-sans">
                      {fullLoading ? 'Building Full 3D Ocean Volume' : 'Reconstructing 3D Ocean Field'}
                    </span>
                  </div>
                  <span className="text-[#8EA4C8] text-[11px] font-mono">
                    {fullLoading
                      ? '50 native depth levels · Real bathymetry terrain'
                      : 'L1/L2 spatial cache · Stratified depth layers'}
                  </span>
                </div>

                {/* Skeleton depth bars */}
                <div className="flex items-end gap-1.5 h-7">
                  {[0.25, 0.45, 0.65, 0.85, 1.0, 0.9, 0.7, 0.5, 0.35, 0.2].map((h, i) => (
                    <div
                      key={i}
                      className="w-1.5 rounded-full bg-gradient-to-t from-teal-500 via-sky-400 to-cyan-300 animate-pulse"
                      style={{
                        height: `${h * 28}px`,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: '1.4s',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          {(() => {
            const slabBathyGrid = isFullMode ? fullVolumeData?.bathymetry : volumeData?.bathymetry;
            const slabBathyLats = isFullMode ? fullVolumeData?.bathymetry_lats : volumeData?.bathymetry_lats;
            const slabBathyLons = isFullMode ? fullVolumeData?.bathymetry_lons : volumeData?.bathymetry_lons;
            console.log('[OceanWorkspace HOP 2: Props passed to OceanSlab]', {
              isFullMode,
              slabBathyGridIsArray: Array.isArray(slabBathyGrid),
              slabBathyGridLength: slabBathyGrid?.length,
              slabBathyGridSample: slabBathyGrid?.[0]?.slice?.(0, 5),
              slabBathyLatsLength: slabBathyLats?.length,
              slabBathyLonsLength: slabBathyLons?.length,
            });
            return null;
          })()}
          <OceanSlab
            depthSlices={activeDepthSlices}
            volumeData={isFullMode ? fullVolumeData : volumeData}
            bathyGrid={isFullMode ? fullVolumeData?.bathymetry : volumeData?.bathymetry}
            bathyLats={isFullMode ? fullVolumeData?.bathymetry_lats : volumeData?.bathymetry_lats}
            bathyLons={isFullMode ? fullVolumeData?.bathymetry_lons : volumeData?.bathymetry_lons}
            grid={gridData}
            floats={combinedFloats}
            showArgo={showArgo}
            showGliders={showGliders}
            visualizationMode={visualizationMode}
            maxDepth={nativeMaxDepth}
            variable={effectiveSlabVariable}
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
          {tempChecked && salChecked ? (
            <div className={`colorbar absolute !top-auto !bottom-4 !right-4 !w-[250px] ${!showMap ? '!bg-white/95 backdrop-blur-md !border-[#1C3A63]/30 !text-[#0B1E3D] rounded-lg shadow-sm' : ''}`}>
              <div className="flex justify-between text-[10.5px] font-semibold mb-1">
                <span className="text-teal-400">Temp (°C)</span>
                <span className="text-purple-400">Salinity (psu)</span>
              </div>
              <div className="flex gap-1.5 h-2.5 my-1">
                <div className="flex-1 rounded-xs bg-gradient-to-r from-blue-600 via-teal-400 to-amber-400" />
                <div className="flex-1 rounded-xs bg-gradient-to-r from-indigo-900 via-sky-400 to-purple-600" />
              </div>
              <div className={`colorbar-range flex justify-between ${!showMap ? '!text-[#6B7C96] font-mono text-[9.5px]' : ''}`}>
                <span>{valueMin === null ? '24' : valueMin.toFixed(1)}°C</span>
                <span className="text-[9px] text-[#8EA4C8]">Split Colorbar</span>
                <span>35.0 psu</span>
              </div>
            </div>
          ) : (
            <div className={`colorbar absolute !top-auto !bottom-4 !right-4 !w-[200px] ${!showMap ? '!bg-white/95 backdrop-blur-md !border-[#1C3A63]/30 !text-[#0B1E3D] rounded-lg shadow-sm' : ''}`}>
              <span className={`${!showMap ? 'font-semibold text-[#0B1E3D]' : ''}`}>{selected[1]}</span>
              <div className={`colorbar-gradient colorbar-${effectiveSlabVariable} ${!showMap ? 'rounded' : ''}`} />
              <div className={`colorbar-range ${!showMap ? '!text-[#6B7C96] font-mono text-[10px]' : ''}`}>
                <span>{valueMin === null ? 'no data' : valueMin.toFixed(3)}</span>
                <span>{selected[2]}</span>
                <span>{valueMax === null ? 'no data' : valueMax.toFixed(3)}</span>
              </div>
            </div>
          )}
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
