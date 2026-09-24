/**
 * usePointData — Reusable hook for fetching /ocean/point data.
 *
 * Extracted from PointQueryPanel so the same request-management logic
 * (sequence guard, 400 ms debounce, stale-response protection) can be
 * reused by the right-panel OceanIntelligencePanel without duplicating
 * the API call or creating a second request lifecycle.
 *
 * @param {{ lat: number, lon: number } | null} point
 * @returns {{ data, loading, fetchError }}
 */
import { useState, useEffect, useRef } from 'react';
import { getOceanPoint } from '../services/oceanApi';
import { useApp, useAppDispatch } from '../context/AppContext';

export default function usePointData(point) {
  const { selectedDepth, selectedDate, isPlayingTime } = useApp();
  const dispatch = useAppDispatch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Guard against stale async responses overwriting newer user selections
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    if (!point?.lat || !point?.lon) return;

    // Suppress fetch entirely while timeline 4D loop is playing
    if (isPlayingTime) return;

    let isMounted = true;
    const currentSeq = ++fetchSeqRef.current;

    // 400 ms debounce prevents API spam while depth slider is scrubbing
    const timeoutId = setTimeout(() => {
      if (!isMounted || currentSeq !== fetchSeqRef.current) return;

      setLoading(true);
      setFetchError(null);
      // Deliberately NOT calling setData(null) so the UI doesn't flash
      // empty during continuous scrubbing of depth/date.

      getOceanPoint(point.lat, point.lon, selectedDepth || 0, selectedDate)
        .then((res) => {
          if (!isMounted || currentSeq !== fetchSeqRef.current) return;
          setData(res);
          dispatch({ type: 'SET_ACTIVE_POINT_QUERY', payload: res });
          setLoading(false);
        })
        .catch((err) => {
          if (!isMounted || currentSeq !== fetchSeqRef.current) return;
          console.error('[usePointData] fetch failed:', err.message);
          setFetchError(err.message);
          setLoading(false);
        });
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [point?.lat, point?.lon, selectedDepth, selectedDate, isPlayingTime, dispatch]);

  return { data, loading, fetchError };
}
