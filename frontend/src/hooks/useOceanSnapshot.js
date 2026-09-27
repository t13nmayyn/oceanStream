/**
 * useOceanSnapshot.js — Cache-first 3D ocean volume data fetcher
 *
 * DATA FLOW (strict cache-first, global ocean support):
 *   L1 RAM → L2 Zarr (any region) → Backup Zarr → on-demand Copernicus fetch
 *
 * CRITICAL RULES:
 *   - Only a REGION change triggers a new API call.
 *   - Previous ocean data stays visible while a new ocean loads.
 *   - Depth/variable/date changes are pure UI-layer operations.
 *   - fetch_status from the backend drives the loading overlay state.
 *   - When fetch_status='fetching', we poll until real data arrives.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getOceanVolume, getOceanSnapshot } from '../services/oceanApi';
import { useApp, useAppDispatch } from '../context/AppContext';

// Predefined bounding boxes for major world oceans & regional seas
export const PREDEFINED_OCEANS = {
  pacific:       { south: -50, north: 50, west: 140, east: -70 },
  pacificOcean:  { south: -50, north: 50, west: 140, east: -70 },
  'pacific-ocean': { south: -50, north: 50, west: 140, east: -70 },
  'Pacific Ocean': { south: -50, north: 50, west: 140, east: -70 },

  atlantic:      { south: -50, north: 60, west: -75, east: 15 },
  atlanticOcean: { south: -50, north: 60, west: -75, east: 15 },
  'atlantic-ocean': { south: -50, north: 60, west: -75, east: 15 },
  'Atlantic Ocean': { south: -50, north: 60, west: -75, east: 15 },

  indian:        { south: -45, north: 25, west: 40, east: 110 },
  indianOcean:   { south: -45, north: 25, west: 40, east: 110 },
  'indian-ocean': { south: -45, north: 25, west: 40, east: 110 },
  'Indian Ocean': { south: -45, north: 25, west: 40, east: 110 },

  southern:      { south: -75, north: -50, west: -180, east: 180 },
  southernOcean: { south: -75, north: -50, west: -180, east: 180 },
  'southern-ocean': { south: -75, north: -50, west: -180, east: 180 },
  'Southern Ocean': { south: -75, north: -50, west: -180, east: 180 },

  arctic:        { south: 65, north: 90, west: -180, east: 180 },
  arcticOcean:   { south: 65, north: 90, west: -180, east: 180 },
  'arctic-ocean': { south: 65, north: 90, west: -180, east: 180 },
  'Arctic Ocean': { south: 65, north: 90, west: -180, east: 180 },

  arabianSea:    { south: 10, north: 25, west: 55, east: 75 },
  'arabian-sea': { south: 10, north: 25, west: 55, east: 75 },
  'Arabian Sea': { south: 10, north: 25, west: 55, east: 75 },

  bayOfBengal:   { south: 5, north: 22, west: 80, east: 98 },
  'bay-of-bengal': { south: 5, north: 22, west: 80, east: 98 },
  'Bay of Bengal': { south: 5, north: 22, west: 80, east: 98 },

  andamanSea:    { south: 5, north: 15, west: 90, east: 98 },
  'andaman-sea': { south: 5, north: 15, west: 90, east: 98 },
  'Andaman Sea': { south: 5, north: 15, west: 90, east: 98 },

  lakshadweepSea: { south: 5, north: 15, west: 68, east: 78 },
  'lakshadweep-sea': { south: 5, north: 15, west: 68, east: 78 },
  'Lakshadweep Sea': { south: 5, north: 15, west: 68, east: 78 },

  global:        { south: -70, north: 70, west: -180, east: 180 },
};

const DEFAULT_BOUNDS = PREDEFINED_OCEANS.indianOcean;

// All standard depth levels — fetched together in one API call
const STANDARD_DEPTHS = '0,10,50,100,200,500,1000';


// Loading phase messages — shown in the 3D ocean overlay
export const LOADING_PHASES = {
  cache_hit:              '⚡ Loading cached data…',
  fetching:               '🌐 Fetching ocean data from Copernicus…',
  processing:             '⚙️ Preparing 3D ocean volume…',
  analytical_placeholder: '🔵 Showing ocean model — real data loading…',
  ready:                  '✅ Ocean data ready',
  error:                  '⚠️ Unable to fetch this region. Showing available data.',
};

function normalizeVolumePoint(point) {
  if (!point || typeof point !== 'object') return null;

  return {
    ...point,
    lat: Number(point.lat ?? point.latitude),
    lon: Number(point.lon ?? point.lng ?? point.longitude),
    temperature_c: point.temperature_c ?? point.temperature ?? point.thetao ?? null,
    salinity_psu: point.salinity_psu ?? point.salinity ?? point.so ?? null,
    chlorophyll_mgl: point.chlorophyll_mgl ?? point.chlorophyll ?? point.chl ?? null,
    oxygen_mmolm3: point.oxygen_mmolm3 ?? point.oxygen ?? point.o2 ?? null,
    ph: point.ph ?? point.pH ?? null,
    current_u_ms: point.current_u_ms ?? point.u_current ?? point.uo ?? 0,
    current_v_ms: point.current_v_ms ?? point.v_current ?? point.vo ?? 0,
  };
}
function normalizeVolumeSlices(data) {
  if (Array.isArray(data?.depth_slices)) {
    return data.depth_slices
      .map((slice) => ({
        ...slice,
        depth_m: Number(slice.depth_m ?? slice.depth ?? 0),
        points: (Array.isArray(slice.points) ? slice.points : [])
          .map(normalizeVolumePoint)
          .filter(Boolean),
      }))
      .filter((slice) => Number.isFinite(slice.depth_m) && slice.points.length > 0);
  }

  if (!Array.isArray(data?.layers)) return [];

  const bbox = data.bbox || {};
  const latMin = Number(bbox.lat_min ?? bbox.south ?? 0);
  const latMax = Number(bbox.lat_max ?? bbox.north ?? latMin);
  const lonMin = Number(bbox.lon_min ?? bbox.west ?? 0);
  const lonMax = Number(bbox.lon_max ?? bbox.east ?? lonMin);

  return data.layers
    .filter((layer) => layer?.status !== 'not_fetched' && Array.isArray(layer?.grid))
    .map((layer) => {
      const grid = layer.grid;
      const latDenom = Math.max(grid.length - 1, 1);
      const points = grid.flatMap((row, i) => {
        if (!Array.isArray(row)) return [];
        const lonDenom = Math.max(row.length - 1, 1);
        return row.map((value, j) => {
          const sample = value && typeof value === 'object' ? value : { temperature: value };
          return normalizeVolumePoint({
            ...sample,
            lat: latMin + (i * (latMax - latMin)) / latDenom,
            lon: lonMin + (j * (lonMax - lonMin)) / lonDenom,
            temperature_c: sample.temperature_c ?? sample.temperature ?? sample.value ?? null,
            salinity_psu: sample.salinity_psu ?? sample.salinity ?? null,
            chlorophyll_mgl: sample.chlorophyll_mgl ?? sample.chlorophyll ?? null,
            oxygen_mmolm3: sample.oxygen_mmolm3 ?? sample.oxygen ?? null,
            current_u_ms: sample.current_u_ms ?? sample.u_current ?? 0,
            current_v_ms: sample.current_v_ms ?? sample.v_current ?? 0,
          });
        }).filter(Boolean);
      });

      return {
        ...layer,
        depth_m: Number(layer.depth_m ?? layer.depth ?? 0),
        points,
      };
    })
    .filter((slice) => Number.isFinite(slice.depth_m) && slice.points.length > 0);
}

async function fetchSnapshotDepthSlices(bounds) {
  const depths = STANDARD_DEPTHS.split(',').map(Number);
  const snapshots = await Promise.all(
    depths.map((depth) => getOceanSnapshot(bounds, depth, null))
  );

  return snapshots.flatMap((snapshot, index) => {
    if (!snapshot || !Array.isArray(snapshot.grid) || snapshot.grid.length === 0) return [];
    return [{
      depth_m: Number(snapshot.depth ?? depths[index]),
      points: snapshot.grid.map(normalizeVolumePoint).filter(Boolean),
      source: snapshot.source,
    }];
  });
}


export default function useOceanSnapshot(region = null) {
  const { selectedVariable, selectedDepth, apiStatus } = useApp();
  const dispatch = useAppDispatch();

  const [volumeData, setVolumeData] = useState(null);
  const [snapshotData, setSnapshotData] = useState(null);
  const [depthSlices, setDepthSlices] = useState([]);
  const [floats, setFloats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(null);   // NEW: granular phase
  const [error, setError] = useState(null);
  const [source, setSource] = useState('reference');
  const [backupDate, setBackupDate] = useState(null);

  const lastFetchedKeyRef = useRef(null);
  const fetchInFlightRef = useRef(false);
  const pollTimerRef = useRef(null);     // NEW: poll timer for fetch_status=fetching
  const fetchSnapshotRef = useRef(null);

  const regionKey = typeof region === 'object' && region !== null
    ? `${region.south ?? region.lat_min}_${region.north ?? region.lat_max}_${region.west ?? region.lon_min}_${region.east ?? region.lon_max}`
    : String(region || 'default');

  const bounds = useMemo(() => {
    if (region && typeof region === 'object') {
      const s = region.south ?? region.lat_min;
      const n = region.north ?? region.lat_max;
      const w = region.west ?? region.lon_min;
      const e = region.east ?? region.lon_max;
      if (s !== undefined && n !== undefined && w !== undefined && e !== undefined) {
        return { south: Number(s), north: Number(n), west: Number(w), east: Number(e) };
      }
    }
    if (typeof region === 'string' && PREDEFINED_OCEANS[region]) {
      return PREDEFINED_OCEANS[region];
    }
    return DEFAULT_BOUNDS;
  }, [regionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive the current grid from loaded volume data based on selected depth.
  // This is a PURE CLIENT-SIDE OPERATION — no API call needed.
  const currentDepthGrid = useMemo(() => {
    if (!volumeData?.depth_slices?.length) return snapshotData?.grid || [];
    const targetDepth = Number(selectedDepth || 0);
    const nearest = volumeData.depth_slices.reduce((best, s) =>
      Math.abs(s.depth_m - targetDepth) < Math.abs(best.depth_m - targetDepth) ? s : best
    );
    return nearest?.points || [];
  }, [volumeData, selectedDepth, snapshotData?.grid]);

  /**
   * Fetch the ocean volume for the current bounds.
   * GLOBAL: works for Pacific, Atlantic, Arctic, Southern Ocean, Indian Ocean.
   * Non-blocking: previous ocean remains visible while new one loads.
   * Polls if backend is still fetching data.
   *
   * @param {boolean} isPoll - true when this is a background poll (don't show loading overlay)
   */
  const fetchSnapshot = useCallback(async (isPoll = false) => {
    if (apiStatus === 'offline') {
      setSource('reference');
      return;
    }
    if (fetchInFlightRef.current && !isPoll) return;

    const fetchKey = `${regionKey}`;
    if (lastFetchedKeyRef.current === fetchKey && volumeData !== null && !isPoll) {
      return;
    }

    fetchInFlightRef.current = true;
    if (!isPoll) {
      setLoading(true);
      setLoadingPhase('processing');
      setError(null);
    }

    try {
      const vol = await getOceanVolume(bounds, STANDARD_DEPTHS, null, selectedVariable);

      const fetchStatus = vol?.fetch_status || 'ready';
      const volumeSlices = normalizeVolumeSlices(vol);
      const fallbackSlices = volumeSlices.length >= 2
        ? []
        : await fetchSnapshotDepthSlices(bounds);
      const slices = fallbackSlices.length >= 2 ? fallbackSlices : volumeSlices;
      let hasRenderableData = slices.length > 0;

      if (slices.length > 0) {
        const normalizedVolume = {
          ...(vol || {}),
          bbox: vol?.bbox || {
            lat_min: bounds.south,
            lat_max: bounds.north,
            lon_min: bounds.west,
            lon_max: bounds.east,
          },
          depth_slices: slices,
          n_slices: slices.length,
        };
        const dataSourceValue = normalizedVolume.data_source || normalizedVolume.source || 'backup_cache';

        setVolumeData(normalizedVolume);
        setDepthSlices(slices);
        setFloats(normalizedVolume.floats || []);
        setSource(dataSourceValue);
        setBackupDate(normalizedVolume.backup_date || null);

        const targetDepth = Number(selectedDepth || 0);
        const matchingSlice = slices.reduce((prev, curr) =>
          Math.abs(curr.depth_m - targetDepth) < Math.abs(prev.depth_m - targetDepth) ? curr : prev
        );

        setSnapshotData({
          ...normalizedVolume,
          depth: matchingSlice?.depth_m ?? targetDepth,
          grid: matchingSlice?.points || [],
        });

        lastFetchedKeyRef.current = fetchKey;

        dispatch({
          type: 'ADD_LOG',
          payload: {
            type: 'info',
            text: `${new Date().toISOString().slice(11, 19)} [VOLUME 3D] ${slices.length} depth layers loaded (${dataSourceValue}) fetch_status=${fetchStatus}`,
          },
        });
      } else {
        // Fallback to 2D snapshot when volume returns no slices
        const snap = await getOceanSnapshot(bounds, 0, null);
        if (snap && snap.grid && snap.grid.length > 0) {
          setVolumeData(null);
          setSnapshotData(snap);
          setSource(snap.source || 'backup_cache');
          setDepthSlices([
            { depth_m: snap.depth || 0, points: snap.grid.map(normalizeVolumePoint).filter(Boolean), source: snap.source },
          ]);
          setFloats([]);
          setBackupDate(null);
          lastFetchedKeyRef.current = fetchKey;
          hasRenderableData = true;
        } else {
          setVolumeData(null);
          setSnapshotData(null);
          setDepthSlices([]);
          setFloats([]);
          setSource('reference');
          setBackupDate(null);
        }
      }

      const isFetching = fetchStatus === 'fetching' || fetchStatus === 'analytical_placeholder';
      setLoadingPhase(
        fetchStatus === 'cache_hit'
          ? 'cache_hit'
          : isFetching
            ? 'fetching'
            : (hasRenderableData ? 'analytical_placeholder' : 'error')
      );

      if (isFetching) {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          fetchSnapshotRef.current?.(true);
        }, 8000);
      } else if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      setLoading(false);
    } catch (err) {
      console.warn('[useOceanSnapshot] fetch error:', err.message);
      setError(err.message);
      setSource('reference');
      setLoadingPhase('error');
      setLoading(false);
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [apiStatus, bounds, selectedVariable, dispatch, regionKey, volumeData, selectedDepth]);

  useEffect(() => {
    fetchSnapshotRef.current = fetchSnapshot;
  }, [fetchSnapshot]);

  // Only fetch when the REGION (bounds) changes — NOT on depth/variable/date changes.
  useEffect(() => {
    lastFetchedKeyRef.current = null;
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    const timer = setTimeout(() => { fetchSnapshot(); }, 150);
    return () => { clearTimeout(timer); if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
  }, [regionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    const timer = setTimeout(() => { fetchSnapshot(); }, 150);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    volumeData,
    depthSlices,
    snapshotData,
    gridData: currentDepthGrid,
    floats: floats.length > 0 ? floats : (volumeData?.floats || []),
    loading,
    loadingPhase,
    error,
    source,
    backupDate,
    dataSource: volumeData?.data_source || source,
    refetch: fetchSnapshot,
  };
}


