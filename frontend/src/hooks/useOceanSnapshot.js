/**
 * useOceanSnapshot.js — Fetches real ocean data from /ocean/snapshot endpoint
 *
 * Returns a grid of physics + BGC values for the globe texture overlay.
 * Falls back gracefully to null (synthetic model) when backend is offline.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getOceanSnapshot } from '../services/oceanApi';
import { useApp, useAppDispatch } from '../context/AppContext';

// Default bounding box: Indian Ocean region + global coverage
const REGIONS = {
  indianOcean: { south: -10, north: 25, west: 50, east: 100 },
  global:      { south: -70, north: 70, west: -180, east: 180 },
};

// Maximum retries for "fetching" status
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export default function useOceanSnapshot(region = 'indianOcean') {
  const { selectedVariable, selectedDepth, selectedDate, apiStatus } = useApp();
  const dispatch = useAppDispatch();

  const [snapshotData, setSnapshotData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('synthetic'); // 'real' | 'synthetic' | 'placeholder'

  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef(null);

  const regionKey = typeof region === 'object' && region !== null
    ? `${region.south}_${region.north}_${region.west}_${region.east}`
    : String(region);

  const bounds = useMemo(() => {
    if (region && typeof region === 'object' && region.south !== undefined && region.north !== undefined) {
      return {
        south: Number(region.south),
        north: Number(region.north),
        west: Number(region.west),
        east: Number(region.east),
      };
    }
    return REGIONS[region] || REGIONS.indianOcean;
  }, [regionKey]);

  const fetchSnapshot = useCallback(async (isRetry = false) => {
    // Don't fetch if backend is offline
    if (apiStatus === 'offline') {
      setSource('synthetic');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getOceanSnapshot(bounds, selectedDepth || 0, selectedDate);

      if (!result) {
        setSource('synthetic');
        setLoading(false);
        return;
      }

      // Success: populate grid if available (even when status is 'fetching' / reference slice)
      if (result.grid && result.grid.length > 0) {
        setSnapshotData(result);
        setSource(result.placeholder ? 'placeholder' : 'real');
        dispatch({
          type: 'ADD_LOG',
          payload: {
            type: 'info',
            text: `${new Date().toISOString().slice(11, 19)} [SNAPSHOT] ${result.grid.length} grid points loaded (${result.source || 'unknown'})`,
          },
        });
      } else {
        setSource('synthetic');
      }

      // Handle "fetching" status — origin data is ingesting in background; schedule a background refresh
      if (result.status === 'fetching') {
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          dispatch({
            type: 'ADD_LOG',
            payload: {
              type: 'info',
              text: `${new Date().toISOString().slice(11, 19)} [SNAPSHOT] Ingestion in progress... retry ${retryCountRef.current}/${MAX_RETRIES}`,
            },
          });
          retryTimeoutRef.current = setTimeout(() => fetchSnapshot(true), RETRY_DELAY_MS);
        }
      } else if (result.status === 'ok') {
        retryCountRef.current = 0;
      }

      setLoading(false);
    } catch (err) {
      console.warn('[useOceanSnapshot] fetch error:', err.message);
      setError(err.message);
      setSource('synthetic');
      setLoading(false);
    }
  }, [apiStatus, bounds, selectedDepth, selectedDate, dispatch]);

  // Fetch on mount and when parameters change with small debounce to batch rapid interactions
  useEffect(() => {
    retryCountRef.current = 0;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    const timer = setTimeout(() => {
      fetchSnapshot();
    }, 200);

    return () => {
      clearTimeout(timer);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [fetchSnapshot]);

  return {
    /** The raw snapshot response from the backend (or null) */
    snapshotData,
    /** The grid array from the snapshot */
    gridData: snapshotData?.grid || [],
    /** Whether we're currently fetching */
    loading,
    /** Error message if fetch failed */
    error,
    /** Data source: 'real', 'placeholder', or 'synthetic' */
    source,
    /** Manually trigger a re-fetch */
    refetch: fetchSnapshot,
  };
}
