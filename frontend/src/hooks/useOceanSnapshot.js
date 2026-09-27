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
  cache_hit:             '⚡ Loading cached data…',
  fetching:              '🌐 Fetching ocean data from Copernicus…',
  processing:            '⚙️ Preparing 3D ocean volume…',
  analytical_placeholder:'🔵 Showing ocean model — real data loading…',
  ready:                 '✅ Ocean data ready',
  error:                 '⚠️ Unable to fetch this region. Showing available data.',
};

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

      if (vol && vol.depth_slices && vol.depth_slices.length > 0) {
        const fetchStatus = vol.fetch_status || 'ready';

        setVolumeData(vol);
        setDepthSlices(vol.depth_slices);
        setFloats(vol.floats || []);
        setSource(vol.data_source || vol.source || 'backup_cache');
        setBackupDate(vol.backup_date || null);

        const targetDepth = Number(selectedDepth || 0);
        const matchingSlice = vol.depth_slices.reduce((prev, curr) =>
          Math.abs(curr.depth_m - targetDepth) < Math.abs(prev.depth_m - targetDepth) ? curr : prev
        );

        const pts = matchingSlice?.points || [];
        setSnapshotData({
          ...vol,
          depth: matchingSlice?.depth_m ?? targetDepth,
          grid: pts,
        });

        lastFetchedKeyRef.current = fetchKey;

        // Determine loading phase from backend fetch_status
        if (fetchStatus === 'cache_hit') {
          setLoadingPhase('cache_hit');
        } else if (fetchStatus === 'fetching') {
          setLoadingPhase('fetching');
        } else {
          setLoadingPhase('analytical_placeholder');
        }

        // If backend is still fetching real data, poll every 8s for updates
        if (fetchStatus === 'fetching' || fetchStatus === 'analytical_placeholder') {
          if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
          pollTimerRef.current = setTimeout(() => {
            fetchSnapshot(true);  // background poll
          }, 8000);
        } else {
          // Real data arrived — clear any pending poll
          if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }

        dispatch({
          type: 'ADD_LOG',
          payload: {
            type: 'info',
            text: `${new Date().toISOString().slice(11, 19)} [VOLUME 3D] ${vol.depth_slices.length} depth layers (${vol.data_source || vol.source || 'cache'}) fetch_status=${fetchStatus}`,
          },
        });
      } else {
        // Fallback to 2D snapshot
        const snap = await getOceanSnapshot(bounds, 0, null);
        if (snap && snap.grid && snap.grid.length > 0) {
          setSnapshotData(snap);
          setSource(snap.source || 'backup_cache');
          setDepthSlices([
            { depth_m: snap.depth || 0, points: snap.grid, source: snap.source },
          ]);
          lastFetchedKeyRef.current = fetchKey;
          setLoadingPhase('analytical_placeholder');
        } else {
          setSource('reference');
          setLoadingPhase('error');
        }
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
  }, [apiStatus, bounds, selectedVariable, dispatch]); // NOTE: selectedDepth intentionally NOT in deps

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


