/**
 * useOceanSnapshot.js — Cache-first 3D ocean volume data fetcher
 *
 * DATA FLOW (strict cache-first):
 *   API (L1 RAM) → L2 Zarr → Backup Zarr → [only on miss] one bounded Copernicus fetch
 *
 * CRITICAL RULE: Only a REGION change triggers a new API call.
 * Depth/variable/date changes are pure UI-layer operations on the
 * already-loaded volumetric data. The API returns ALL depth slices in one
 * response — no per-depth requests are made.
 *
 * Copernicus is NOT a streaming source. It is fetched once per cache miss,
 * then the result is stored in L2 Zarr and served from cache thereafter.
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

export default function useOceanSnapshot(region = null) {
  // Only use selectedVariable from context for passing to volume API
  // (for cache-key differentiation). Do NOT use selectedDepth/selectedDate
  // as fetch triggers — those are UI-only selectors.
  const { selectedVariable, selectedDepth, apiStatus } = useApp();
  const dispatch = useAppDispatch();

  const [volumeData, setVolumeData] = useState(null);
  const [snapshotData, setSnapshotData] = useState(null);
  const [depthSlices, setDepthSlices] = useState([]);
  const [floats, setFloats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('reference');
  const [backupDate, setBackupDate] = useState(null);

  // Track the last fetched bounds key to avoid redundant fetches
  const lastFetchedKeyRef = useRef(null);
  const fetchInFlightRef = useRef(false);

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
    // Find nearest depth slice to selected depth
    const nearest = volumeData.depth_slices.reduce((best, s) =>
      Math.abs(s.depth_m - targetDepth) < Math.abs(best.depth_m - targetDepth) ? s : best
    );
    return nearest?.points || [];
  }, [volumeData, selectedDepth, snapshotData?.grid]);

  /**
   * Fetch the ocean volume for the current bounds.
   * This goes through the cache-first hierarchy:
   *   L1 (RAM, handled by FastAPI) → L2 (Zarr) → Backup → Copernicus (miss only)
   *
   * Only called when REGION changes. Depth/variable changes use the
   * already-loaded volume data.
   */
  const fetchSnapshot = useCallback(async () => {
    if (apiStatus === 'offline') {
      setSource('reference');
      return;
    }
    if (fetchInFlightRef.current) return;

    // Deduplicate: skip if we've already loaded this region
    const fetchKey = `${regionKey}`;
    if (lastFetchedKeyRef.current === fetchKey && volumeData !== null) {
      return;
    }

    fetchInFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Fetch complete 3D volume across all standard depth bins.
      // The backend returns L1 cache → L2 Zarr → backup → Copernicus (miss only).
      // We do NOT pass selectedDate to avoid triggering fetches on date changes —
      // the backend uses its latest_available_iso() by default which is correct.
      const vol = await getOceanVolume(bounds, STANDARD_DEPTHS, null, selectedVariable);

      if (vol && vol.depth_slices && vol.depth_slices.length > 0) {
        setVolumeData(vol);
        setDepthSlices(vol.depth_slices);
        setFloats(vol.floats || []);
        setSource(vol.data_source || vol.source || 'backup_cache');
        setBackupDate(vol.backup_date || null);

        // Set snapshot from the nearest depth slice to selected depth
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

        dispatch({
          type: 'ADD_LOG',
          payload: {
            type: 'info',
            text: `${new Date().toISOString().slice(11, 19)} [VOLUME 3D] ${vol.depth_slices.length} depth layers loaded (${vol.data_source || vol.source || 'cache'})`,
          },
        });
      } else {
        // Fallback to 2D snapshot if volume returned empty (e.g. no zarr at all)
        const snap = await getOceanSnapshot(bounds, 0, null);
        if (snap && snap.grid && snap.grid.length > 0) {
          setSnapshotData(snap);
          setSource(snap.source || 'backup_cache');
          setDepthSlices([
            { depth_m: snap.depth || 0, points: snap.grid, source: snap.source },
          ]);
          lastFetchedKeyRef.current = fetchKey;
        } else {
          setSource('reference');
        }
      }
      setLoading(false);
    } catch (err) {
      console.warn('[useOceanSnapshot] fetch error:', err.message);
      setError(err.message);
      setSource('reference');
      setLoading(false);
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [apiStatus, bounds, selectedVariable, dispatch]); // NOTE: selectedDepth and selectedDate intentionally NOT in deps

  // Only fetch when the REGION (bounds) changes — NOT on depth/variable/date changes.
  // Depth changes: use currentDepthGrid (derived from loaded volumeData).
  // Variable changes: OceanSlab re-colors using the same loaded data.
  // Date changes: not automatically re-fetched — data in cache serves the demo.
  useEffect(() => {
    // Clear the last fetched key so region changes always trigger a fresh fetch
    lastFetchedKeyRef.current = null;
    const timer = setTimeout(() => {
      fetchSnapshot();
    }, 150);
    return () => clearTimeout(timer);
  }, [regionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSnapshot();
    }, 150);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    volumeData,
    depthSlices,
    snapshotData,
    // gridData: the depth slice matching the currently selected depth (UI-derived, no API call)
    gridData: currentDepthGrid,
    floats: floats.length > 0 ? floats : (volumeData?.floats || []),
    loading,
    error,
    source,
    backupDate,
    dataSource: volumeData?.data_source || source,
    refetch: fetchSnapshot,
  };
}

