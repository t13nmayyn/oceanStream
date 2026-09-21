/**
 * ExplorerPage — Phase 2B lightweight globe navigation page (/explorer)
 *
 * Renders ONLY:
 *   1. AppNav
 *   2. LightweightGlobeView  (no snapshot/argo/slab hooks)
 *   3. CoordinateExplorer    (bottom-left: lat, lon, depth, date + quick pills)
 *   4. SummarySidebar        (right: async metrics, never blocks globe)
 *
 * Heavy components (OceanWorkspace, OceanSlab, GlobeGlViewer,
 * useOceanSnapshot, useArgoFloats, TimelineControl, ArgoProfilePanel,
 * AnomalyAnalysisPanel, OceanStreamCopilot) are intentionally absent.
 * They live exclusively on /ocean-detail.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp, useAppDispatch } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApiHealth } from '../hooks/useApiHealth';

import AppNav from '../components/navigation/AppNav';
import LightweightGlobeView from '../components/map/LightweightGlobeView';
import CoordinateExplorer from '../components/explorer/CoordinateExplorer';
import SummarySidebar from '../components/explorer/SummarySidebar';

export default function ExplorerPage() {
  // Region that the globe is currently hovering / focused — drives sidebar + explorer fill
  const [focusedRegion, setFocusedRegion] = useState(null);
  const [developerOpen, setDeveloperOpen] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { apiStatus, wsStatus, logs } = useApp();

  // Keep WS + health alive for nav-bar status indicators.
  // useDateControls intentionally omitted — it triggers snapshot fetches.
  useWebSocket();
  useApiHealth();

  useEffect(() => {
    dispatch({
      type: 'SET_USER_MODE',
      payload: searchParams.get('mode') === 'analyze' ? 'analyze' : 'explore',
    });
  }, [dispatch, searchParams]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setDeveloperOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  /**
   * Globe marker click handler.
   *
   * "Custom Region" (id: 'custom-region'):
   *   → sets focusedRegion so CoordinateExplorer clears its fields for manual entry.
   *   → does NOT navigate.
   *
   * All other markers:
   *   → navigate to /ocean-detail with full router state:
   *     { region, lat, lon, bbox, depth, date }
   *   → depth defaults to the marker's depth (0) since the globe has no depth control.
   *   → date defaults to today — user can refine in CoordinateExplorer first if needed.
   */
  const handleMarkerClick = useCallback((marker) => {
    if (marker.id === 'custom-region') {
      setFocusedRegion(marker);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    navigate(
      `/ocean-detail?lat=${marker.lat}&lon=${marker.lng}&depth=${marker.depth || 0}&date=${today}`,
      {
        state: {
          region: marker.name,
          lat: marker.lat,
          lon: marker.lng,
          depth: marker.depth || 0,
          date: today,
          bbox: marker.bbox,
        },
      }
    );
  }, [navigate]);

  /**
   * CoordinateExplorer "Explore" handler.
   *
   * @param {{ lat, lon, depth, date }} point  — validated coordinate values
   * @param {{ south, north, west, east }} bbox — real or ±2° derived
   * @param {string|null} regionName            — matched region name, or null for freeform
   */
  const handleExplore = useCallback((point, bbox, regionName) => {
    navigate(
      `/ocean-detail?lat=${point.lat}&lon=${point.lon}&depth=${point.depth}&date=${point.date}`,
      {
        state: {
          region: regionName,
          lat: point.lat,
          lon: point.lon,
          depth: point.depth,
          date: point.date,
          bbox,
        },
      }
    );
  }, [navigate]);

  return (
    <div className="explorer-layout flex flex-col w-screen h-screen overflow-hidden bg-slate-50 text-slate-800">
      <AppNav />

      <div className="flex-1 relative overflow-hidden" style={{ paddingTop: '56px' }}>
        {/* Lightweight globe — no useOceanSnapshot, no useArgoFloats */}
        <LightweightGlobeView
          onMarkerClick={handleMarkerClick}
          onMarkerHover={setFocusedRegion}
        />

        {/* Bottom-left: coordinate entry panel */}
        <CoordinateExplorer
          onExplore={handleExplore}
          focusedRegion={focusedRegion}
        />

        {/* Right: async summary metrics, never blocks globe */}
        <SummarySidebar focusedRegion={focusedRegion} />
      </div>

      {developerOpen && (
        <aside className="developer-panel" aria-label="Developer diagnostics">
          <button type="button" onClick={() => setDeveloperOpen(false)}>Close</button>
          <h2>Developer diagnostics</h2>
          <p>API: {apiStatus}</p>
          <p>WebSocket: {wsStatus}</p>
          <p>Recent events: {logs.length}</p>
          <pre>{JSON.stringify(logs.slice(0, 12), null, 2)}</pre>
        </aside>
      )}
    </div>
  );
}
