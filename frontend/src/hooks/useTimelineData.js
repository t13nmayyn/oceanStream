/**
 * useTimelineData — Reusable hook for /ocean/timeline requests.
 *
 * Wraps getOceanTimeline() with the same request-protection patterns
 * used in usePointData: sequence-number guard, debounce, stale-response
 * protection, and mounted-check.  This prevents render-loop fetches,
 * duplicate requests, and race conditions when point/depth/preset change
 * rapidly.
 *
 * @param {{ lat: number, lon: number } | null} point
 * @param {string} preset  — '7d' | '30d' | '90d' | '1yr'
 * @param {string} variableGroup — 'physics' | 'bgc'
 * @returns {{ data, loading, fetchError }}
 *   data — raw response from getOceanTimeline(), or null
 *   loading — true while a request is in-flight
 *   fetchError — string message on API failure, null otherwise
 */
import { useState, useEffect, useRef } from 'react';
import { getOceanTimeline } from '../services/oceanApi';
import { useApp } from '../context/AppContext';

// Variables requested per group
const VARIABLE_GROUPS = {
  physics: 'temperature,salinity',
  bgc:     'chlorophyll,oxygen,ph,nitrate',
};

// Presets the backend supports (passed as `preset` param).
// '90d' and '1yr' map to query period; backend decides granularity.
export const SUPPORTED_PRESETS = [
  { id: '7d',  label: '7d'  },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: '1yr', label: '1yr' },
];

export default function useTimelineData(point, preset = '7d', variableGroup = 'physics') {
  const { selectedDepth, isPlayingTime } = useApp();
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchSeqRef = useRef(0);
  // Keep previous data visible during re-fetch (stale-while-revalidate feel)
  const prevDataRef = useRef(null);

  useEffect(() => {
    if (!point?.lat || !point?.lon) return;
    if (isPlayingTime) return;

    let isMounted = true;
    const currentSeq = ++fetchSeqRef.current;
    const variables = VARIABLE_GROUPS[variableGroup] ?? VARIABLE_GROUPS.physics;

    // 500 ms debounce — slightly longer than usePointData to avoid
    // two back-to-back requests when point AND preset change together.
    const timeoutId = setTimeout(() => {
      if (!isMounted || currentSeq !== fetchSeqRef.current) return;

      // Set loading without blanking the previous data
      setLoading(true);
      setFetchError(null);

      getOceanTimeline(point.lat, point.lon, selectedDepth || 0, preset, variables)
        .then((res) => {
          if (!isMounted || currentSeq !== fetchSeqRef.current) return;
          prevDataRef.current = res;
          setData(res);
          setLoading(false);
        })
        .catch((err) => {
          if (!isMounted || currentSeq !== fetchSeqRef.current) return;
          console.error('[useTimelineData] fetch failed:', err.message);
          setFetchError(err.message);
          setLoading(false);
        });
    }, 500);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [point?.lat, point?.lon, selectedDepth, preset, variableGroup, isPlayingTime]);

  // Return previous data during re-load so chart stays visible
  return {
    data: data ?? prevDataRef.current,
    loading,
    fetchError,
    isStale: loading && prevDataRef.current !== null,
  };
}
