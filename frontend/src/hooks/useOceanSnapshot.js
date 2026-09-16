/**
 * useOceanSnapshot.js — Fetches real ocean data from /ocean/snapshot endpoint
 *
 * Returns a grid of physics + BGC values for the globe texture overlay.
 * Falls back gracefully to null (synthetic model) when backend is offline.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { getOceanSnapshot } from '../services/oceanApi';
import { useApp, useAppDispatch } from '../context/AppContext';

// Default bounding box: Indian Ocean region + global coverage
const REGIONS = {
  indianOcean: { south: -10, north: 25, west: 50, east: 100 },
  global:      { south: -70, north: 70, west: -180, east: 180 },
};

// Minimum interval between API calls (ms) to avoid spamming
const FETCH_DEBOUNCE_MS = 2000;
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

  const lastFetchRef = useRef(0);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef(null);

  const bounds = REGIONS[region] || REGIONS.indianOcean;

  const fetchSnapshot = useCallback(async (isRetry = false) => {
    // Don't fetch if backend is offline
    if (apiStatus === 'offline') {
      setSource('synthetic');
      return;
    }

    // Debounce
    const now = Date.now();
    if (!isRetry && now - lastFetchRef.current < FETCH_DEBOUNCE_MS) {
      return;
    }
    lastFetchRef.current = now;

    setLoading(true);
    setError(null);

    try {
      const result = await getOceanSnapshot(bounds, selectedDepth || 0, selectedDate);

      if (!result) {
        setSource('synthetic');
        setLoading(false);
        return;
      }

      // Handle "fetching" status — data is being ingested, retry later
      if (result.status === 'fetching') {
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          dispatch({
            type: 'ADD_LOG',
            payload: {
              type: 'info',
              text: `${new Date().toISOString().slice(11, 19)} [SNAPSHOT] Data fetching from origin... retry ${retryCountRef.current}/${MAX_RETRIES}`,
            },
          });
          retryTimeoutRef.current = setTimeout(() => fetchSnapshot(true), RETRY_DELAY_MS);
        }
        setSource('synthetic');
        setLoading(false);
        return;
      }

      // Success
      if (result.grid && result.grid.length > 0) {
        retryCountRef.current = 0;
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

      setLoading(false);
    } catch (err) {
      console.warn('[useOceanSnapshot] fetch error:', err.message);
      setError(err.message);
      setSource('synthetic');
      setLoading(false);
    }
  }, [apiStatus, bounds, selectedDepth, selectedDate, dispatch]);

  // Fetch on mount and when parameters change
  useEffect(() => {
    retryCountRef.current = 0;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    fetchSnapshot();

    return () => {
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
