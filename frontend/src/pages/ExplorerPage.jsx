/**
 * ExplorerPage — Phase 2B lightweight globe navigation page (/explorer)
 *
 * Renders:
 *   1. AppNav
 *   2. TargetCursor (React Bits interactive precision cursor)
 *   3. LightweightGlobeView (interactive point selection, lat/lon raycasting)
 *   4. Coordinate HUD (active target coordinate feedback)
 *   5. CoordinateExplorer (bottom-left: lat, lon, depth, date + quick pills)
 *   6. SummarySidebar (right: real-time ocean model metrics for the exact lat/lon)
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
import TargetCursor from '../components/ui/TargetCursor';
import { Crosshair, MapPin, Sparkles } from 'lucide-react';

export default function ExplorerPage() {
  // Active selected point from clicking anywhere on the globe surface
  const [selectedPoint, setSelectedPoint] = useState(null);
  // Region that the globe is currently hovering / focused — drives sidebar + explorer fill
  const [focusedRegion, setFocusedRegion] = useState(null);
  const [developerOpen, setDeveloperOpen] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { apiStatus, wsStatus, logs } = useApp();

  // Keep WS + health alive for nav-bar status indicators.
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
   * Called when user clicks anywhere on the 3D globe surface
   */
  const handlePointSelect = useCallback((point) => {
    setSelectedPoint(point);
    setFocusedRegion(point);
  }, []);

  /**
   * Globe marker click handler.
   */
  const handleMarkerClick = useCallback((marker) => {
    if (marker.id === 'custom-region') {
      setSelectedPoint(null);
      setFocusedRegion(marker);
      return;
    }

    setSelectedPoint(marker);
    setFocusedRegion(marker);

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

  const activeCoord = selectedPoint || (focusedRegion?.lat != null ? focusedRegion : null);

  return (
    <div className="explorer-layout flex flex-col w-screen h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* React Bits Target Cursor with animated lock-on */}
      <TargetCursor
        targetSelector=".cursor-target, .cursor-pointer, button, [role='button'], a, input, select"
        cursorColor="#00e5ff"
        cursorColorOnTarget="#10b981"
        spinDuration={3}
        hoverDuration={0.18}
      />

      <AppNav />

      <div className="flex-1 relative overflow-hidden" style={{ paddingTop: '56px' }}>
        {/* Lightweight 3D Globe with click raycasting & attached point marker */}
        <LightweightGlobeView
          selectedPoint={selectedPoint}
          onPointSelect={handlePointSelect}
          onMarkerClick={handleMarkerClick}
          onMarkerHover={setFocusedRegion}
        />

        {/* Selected Coordinates & Target HUD */}
        <div className="absolute top-18 left-6 z-20 flex flex-col gap-2 pointer-events-none select-none">
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 shadow-lg shadow-cyan-950/40 text-xs">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <Crosshair size={14} className="text-cyan-400" />
            <span className="font-semibold text-slate-200 tracking-wide">3D Point Targeter:</span>
            {activeCoord ? (
              <span className="font-mono text-cyan-300 font-bold tracking-wider">
                {activeCoord.lat >= 0 ? `${activeCoord.lat.toFixed(4)}°N` : `${Math.abs(activeCoord.lat).toFixed(4)}°S`}
                {', '}
                {activeCoord.lng >= 0 ? `${activeCoord.lng.toFixed(4)}°E` : `${Math.abs(activeCoord.lng).toFixed(4)}°W`}
              </span>
            ) : (
              <span className="text-slate-400 italic">Click anywhere on the globe to target</span>
            )}
          </div>
        </div>

        {/* Bottom-left: coordinate entry panel */}
        <CoordinateExplorer
          onExplore={handleExplore}
          focusedRegion={focusedRegion}
        />

        {/* Right: async summary metrics, aligned to exact coordinates */}
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
