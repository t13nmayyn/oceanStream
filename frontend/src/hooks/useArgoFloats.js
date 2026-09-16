/**
 * useArgoFloats.js — Fetches live Argo float positions from the backend
 *
 * Returns an array of floats with lat/lon/type/sensors for the globe markers.
 * Falls back to hardcoded INCOIS data when backend is unavailable.
 */
import { useState, useEffect, useRef } from 'react';
import { getActiveArgoFloats } from '../services/argoApi';
import { useApp, useAppDispatch } from '../context/AppContext';

// Hardcoded fallback floats (INCOIS Indian Ocean region)
const FALLBACK_FLOATS = [
  // Core Argo Floats (Arabian Sea & Bay of Bengal)
  { id: '2902765', name: 'Argo #2902765', type: 'core', lat: 13.08, lng: 80.27, depth: '2,000 m', sensors: ['CTD', 'Temp', 'Salinity'], color: '#38bdf8' },
  { id: '2902768', name: 'Argo #2902768', type: 'core', lat: 12.79, lng: 80.85, depth: '2,000 m', sensors: ['CTD', 'Temp', 'Salinity'], color: '#38bdf8' },
  { id: '2902772', name: 'Argo #2902772', type: 'core', lat: 12.81, lng: 81.04, depth: '2,000 m', sensors: ['CTD', 'Temp', 'Salinity'], color: '#38bdf8' },
  { id: '7902249', name: 'Argo #7902249', type: 'core', lat: 13.44, lng: 81.88, depth: '2,000 m', sensors: ['CTD', 'Temp', 'Salinity'], color: '#38bdf8' },
  { id: '1902670', name: 'Argo #1902670', type: 'core', lat: 11.58, lng: 81.08, depth: '2,000 m', sensors: ['CTD', 'Temp', 'Salinity'], color: '#38bdf8' },
  { id: '2903989', name: 'Argo #2903989', type: 'core', lat: 10.60, lng: 83.68, depth: '2,000 m', sensors: ['CTD', 'Temp', 'Salinity'], color: '#38bdf8' },

  // BGC-Argo Floats & Gliders
  { id: '2903341', name: 'BGC-Argo #2903341', type: 'bgc', lat: 15.20, lng: 72.80, depth: '2,000 m', sensors: ['Chl-a', 'O2', 'Nitrate', 'pH'], color: '#a855f7' },
  { id: '2903342', name: 'BGC-Argo #2903342', type: 'bgc', lat: 8.50, lng: 76.90, depth: '2,000 m', sensors: ['Chl-a', 'O2', 'Nitrate', 'pH'], color: '#a855f7' },
  { id: '2903345', name: 'INCOIS Glider #01', type: 'glider', lat: 17.68, lng: 83.21, depth: '1,000 m', sensors: ['Micro-CTD', 'Acoustic', 'O2'], color: '#ec4899' },
  { id: '2903346', name: 'INCOIS Glider #02', type: 'glider', lat: 11.66, lng: 92.74, depth: '1,000 m', sensors: ['Micro-CTD', 'Turbidity', 'Chl-a'], color: '#ec4899' },

  // INCOIS Mooring Stations
  { id: 'INCOIS-CH1', name: 'INCOIS Mooring (Chennai)', type: 'ctd', lat: 13.12, lng: 80.45, depth: '150 m', sensors: ['ADCP', 'Surface Met', 'CTD'], color: '#f59e0b' },
  { id: 'INCOIS-KC1', name: 'INCOIS Mooring (Kochi)', type: 'ctd', lat: 9.93, lng: 76.15, depth: '120 m', sensors: ['ADCP', 'Currents', 'CTD'], color: '#f59e0b' },
  { id: 'INCOIS-PB1', name: 'INCOIS Mooring (Port Blair)', type: 'ctd', lat: 11.62, lng: 92.80, depth: '450 m', sensors: ['Tsunami Gauge', 'CTD'], color: '#f59e0b' },
  { id: 'INCOIS-LK1', name: 'INCOIS Mooring (Lakshadweep)', type: 'ctd', lat: 10.56, lng: 72.64, depth: '300 m', sensors: ['Coral Health', 'SST', 'CTD'], color: '#f59e0b' },
];

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

  const [floats, setFloats] = useState(FALLBACK_FLOATS);
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
            // Merge live data with fallback mooring stations (type=ctd)
            const liveIds = new Set(normalized.map(f => f.id));
            const moorings = FALLBACK_FLOATS.filter(f => f.type === 'ctd' && !liveIds.has(f.id));
            setFloats([...normalized, ...moorings]);
            setIsLive(true);

            dispatch({
              type: 'ADD_LOG',
              payload: {
                type: 'info',
                text: `${new Date().toISOString().slice(11, 19)} [ARGO] ${normalized.length} live floats loaded from backend`,
              },
            });
          } else {
            setFloats(FALLBACK_FLOATS);
            setIsLive(false);
          }
        } else {
          setFloats(FALLBACK_FLOATS);
          setIsLive(false);
        }

        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('[useArgoFloats] backend unavailable, using fallback:', err.message);
        setFloats(FALLBACK_FLOATS);
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
