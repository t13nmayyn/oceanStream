/**
 * useArgoFloats.js — Fetches live Argo float positions from the backend
 *
 * Returns an array of floats with lat/lon/type/sensors for the globe markers.
 * Falls back to hardcoded INCOIS data when backend is unavailable.
 */
import { useState, useEffect, useRef } from 'react';
import { getActiveArgoFloats } from '../services/argoApi';
import { useApp, useAppDispatch } from '../context/AppContext';

// Color map by Argo type
const TYPE_COLORS = {
  core: '#38bdf8',
  bgc: '#a855f7',
  deep: '#14b8a6',
  glider: '#ec4899',
  ctd: '#f59e0b',
};

/**
 * Normalize backend Argo response into globe-ready point format
 */
function normalizeArgoFloat(raw) {
  const type = (raw.type || raw.float_type || 'core').toLowerCase();
  return {
    id: String(raw.platform_number || raw.id || raw.wmo),
    name: `${type === 'bgc' ? 'BGC-Argo' : type === 'glider' ? 'Glider' : 'Argo'} #${raw.platform_number || raw.id}`,
    type,
    lat: raw.lat || raw.latitude,
    lng: raw.lon || raw.lng || raw.longitude,
    depth: raw.max_depth ? `${raw.max_depth} m` : '2,000 m',
    sensors: raw.sensors || ['CTD', 'Temp', 'Salinity'],
    color: TYPE_COLORS[type] || '#38bdf8',
    lastDate: raw.last_date || raw.date,
  };
}

export default function useArgoFloats(limit = 200) {
  const { apiStatus } = useApp();
  const dispatch = useAppDispatch();

  const [floats, setFloats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (apiStatus === 'offline' || hasFetchedRef.current) return;

    let isMounted = true;
    setLoading(true);

    getActiveArgoFloats(limit)
      .then((result) => {
        if (!isMounted) return;
        hasFetchedRef.current = true;

        // Backend returns array of floats or object with floats property
        const rawFloats = Array.isArray(result)
          ? result
          : result?.floats || result?.data || [];

        if (rawFloats.length > 0) {
          const normalized = rawFloats
            .map(normalizeArgoFloat)
            .filter((f) => f.lat && f.lng && !isNaN(f.lat) && !isNaN(f.lng));

          if (normalized.length > 0) {
            setFloats(normalized);
            setIsLive(true);

            dispatch({
              type: 'ADD_LOG',
              payload: {
                type: 'info',
                text: `${new Date().toISOString().slice(11, 19)} [ARGO] ${normalized.length} live floats loaded from backend`,
              },
            });
          } else {
            setFloats([]);
            setIsLive(false);
          }
        } else {
          setFloats([]);
          setIsLive(false);
        }

        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('[useArgoFloats] backend unavailable, using fallback:', err.message);
        setFloats([]);
        setIsLive(false);
        setLoading(false);
        hasFetchedRef.current = true;
      });

    return () => {
      isMounted = false;
    };
  }, [apiStatus, limit, dispatch]);

  return {
    /** Array of float objects ready for globe.gl pointsData */
    floats,
    /** Whether we're fetching */
    loading,
    /** Whether data is live from backend or fallback */
    isLive,
  };
}
