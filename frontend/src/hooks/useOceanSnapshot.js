/**
 * useOceanSnapshot.js — Fetches ocean volume data from /ocean/volume endpoint
 *
 * Provides 3D multi-depth slices (0, 10, 50, 100, 200, 500, 1000m) with
 * Argo float overlays and automatic fallback:
 *   live Zarr → backup Zarr (data_source="backup_cache") → reference demo field
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

export default function useOceanSnapshot(region = null) {
  const { selectedVariable, selectedDepth, selectedDate, apiStatus } = useApp();
  const dispatch = useAppDispatch();

  const [volumeData, setVolumeData] = useState(null);
  const [snapshotData, setSnapshotData] = useState(null);
  const [depthSlices, setDepthSlices] = useState([]);
  const [floats, setFloats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('reference'); // 'copernicus_zarr' | 'backup_cache' | 'reference'
  const [backupDate, setBackupDate] = useState(null);

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
  }, [regionKey]);

  const fetchSnapshot = useCallback(async () => {
    if (apiStatus === 'offline') {
      setSource('reference');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch complete 3D volume across all standard depth bins (0, 10, 50, 100, 200, 500, 1000m)
      const vol = await getOceanVolume(bounds, '0,10,50,100,200,500,1000', selectedDate, selectedVariable);

      if (vol && vol.depth_slices && vol.depth_slices.length > 0) {
        setVolumeData(vol);
        setDepthSlices(vol.depth_slices);
        setFloats(vol.floats || []);
        setSource(vol.data_source || vol.source || 'backup_cache');
        setBackupDate(vol.backup_date || null);

        // Find depth slice matching currently selected depth or fallback to surface (0m)
        const targetDepth = Number(selectedDepth || 0);
        let matchingSlice = vol.depth_slices.find((s) => Math.abs(s.depth_m - targetDepth) < 1.0);
        if (!matchingSlice) {
          // Nearest depth slice
          matchingSlice = vol.depth_slices.reduce((prev, curr) =>
            Math.abs(curr.depth_m - targetDepth) < Math.abs(prev.depth_m - targetDepth) ? curr : prev
          );
        }

        const pts = matchingSlice?.points || [];
        setSnapshotData({
          ...vol,
          depth: matchingSlice?.depth_m ?? targetDepth,
          grid: pts,
        });

        dispatch({
          type: 'ADD_LOG',
          payload: {
            type: 'info',
            text: `${new Date().toISOString().slice(11, 19)} [VOLUME 3D] ${vol.depth_slices.length} depth layers loaded (${vol.data_source || vol.source})`,
          },
        });
      } else {
        // Fallback to 2D snapshot if volume returned empty
        const snap = await getOceanSnapshot(bounds, selectedDepth || 0, selectedDate);
        if (snap && snap.grid && snap.grid.length > 0) {
          setSnapshotData(snap);
          setSource(snap.source || 'backup_cache');
          setDepthSlices([
            { depth_m: snap.depth || 0, points: snap.grid, source: snap.source },
          ]);
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
    }
  }, [apiStatus, bounds, selectedDepth, selectedDate, selectedVariable, dispatch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSnapshot();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchSnapshot]);

  return {
    volumeData,
    depthSlices,
    snapshotData,
    gridData: snapshotData?.grid || [],
    floats: floats.length > 0 ? floats : (volumeData?.floats || []),
    loading,
    error,
    source,
    backupDate,
    dataSource: volumeData?.data_source || source,
    refetch: fetchSnapshot,
  };
}
