/**
 * OceanDetailPage — Phase 3A
 *
 * Route: /ocean-detail
 *
 * Layout:
 *   AppNav (56px)
 *   Context bar: [← Back to Globe] | region/coords | date
 *   ┌────────────────────────┬────────────────────────────────┐
 *   │  Left 60% — OceanSlab  │  Right 40% — OceanIntelligence │
 *   │  + variable controls   │  ├─ Point Data (Phase 3A live) │
 *   │  + depth slider        │  ├─ Timeline Analysis (Phase 3B)│
 *   │  + time player         │  ├─ Observations (Phase 3B)    │
 *   │  + colorbar            │  └─ AI Explanation (Phase 3B)  │
 *   │  + coverage strip      │                                │
 *   └────────────────────────┴────────────────────────────────┘
 *
 * NO MapView, GlobeGlViewer, or Cesium globe on this page.
 * OceanWorkspace renders with showMap={false}.
 *
 * Context received from router state (primary) or URL params (fallback):
 *   { region, lat, lon, depth, date, bbox }
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useApp, useAppDispatch } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApiHealth } from '../hooks/useApiHealth';
import { useDateControls } from '../hooks/useDateControls';
import { ArrowLeft } from 'lucide-react';

import AppNav from '../components/navigation/AppNav';
import OceanWorkspace from '../components/ocean/OceanWorkspace';
import OceanStreamCopilot from '../components/copilot/OceanStreamCopilot';
import OceanIntelligencePanel from '../components/scientist/OceanIntelligencePanel';


// ── OceanDetailPage ──────────────────────────────────────────────────────────

export default function OceanDetailPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { selectedDate, apiStatus, wsStatus, logs, activePointQuery } = useApp();

  useWebSocket();
  useApiHealth();
  useDateControls();

  const [developerOpen, setDeveloperOpen] = useState(false);

  // ── Extract context from router state → URL params fallback ────────────────
  const regionName = location.state?.region ?? searchParams.get('region') ?? null;
  const initialLat  = location.state?.lat  ?? searchParams.get('lat')  ?? null;
  const initialLon  = location.state?.lon  ?? searchParams.get('lon')  ?? null;
  const initialDepth = Number(location.state?.depth ?? searchParams.get('depth') ?? 0);
  const initialDate  = location.state?.date ?? searchParams.get('date') ?? null;

  // Seed AppContext with the incoming depth + date so OceanWorkspace picks them up
  useEffect(() => {
    if (Number.isFinite(initialDepth)) {
      dispatch({ type: 'SET_DEPTH', payload: initialDepth });
    }
    if (initialDate) {
      dispatch({ type: 'SET_DATE', payload: initialDate });
    }
  }, []); // run once on mount — useDateControls may override date later if server has a newer one

  // Set mode from URL (default explore)
  useEffect(() => {
    dispatch({
      type: 'SET_USER_MODE',
      payload: searchParams.get('mode') === 'analyze' ? 'analyze' : 'explore',
    });
  }, [dispatch, searchParams]);

  // Developer panel shortcut
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDeveloperOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handlePointClick = useCallback((lat, lon) => {
    // Point clicks inside OceanWorkspace slab — update AppContext activePointQuery
    dispatch({ type: 'SET_ACTIVE_POINT_QUERY', payload: { lat, lon } });
  }, [dispatch]);

  // ── Effective point: slab-click or marker selection takes precedence,
  //    then fallback to the router-supplied initial coordinates.
  const effectivePoint = useMemo(() => {
    if (activePointQuery?.lat != null && activePointQuery?.lon != null) {
      return { lat: Number(activePointQuery.lat), lon: Number(activePointQuery.lon) };
    }
    if (initialLat != null && initialLon != null) {
      return { lat: Number(initialLat), lon: Number(initialLon) };
    }
    return null;
  }, [activePointQuery, initialLat, initialLon]);

  // ── Context bar labels ─────────────────────────────────────────────────────
  const locationLabel = regionName
    ? regionName
    : (initialLat != null && initialLon != null)
      ? `${Number(initialLat).toFixed(2)}°N, ${Number(initialLon).toFixed(2)}°E`
      : 'Ocean Detail';

  const dateLabel = selectedDate
    ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#0B1E3D] text-white">
      {/* ── AppNav ─────────────────────────────────────────────────────────── */}
      <AppNav />

      {/* ── Context bar ──────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 border-b border-[#1C3A63] bg-[#0B1E3D]/95 backdrop-blur-sm"
        style={{ height: '44px', marginTop: '56px' }}
      >
        {/* Back to Globe */}
        <button
          type="button"
          onClick={() => navigate('/explorer')}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-[#8EA4C8] hover:text-teal-400 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-white/10 shrink-0"
        >
          <ArrowLeft size={14} />
          Globe
        </button>

        <div className="w-px h-4 bg-[#1C3A63] shrink-0" />

        {/* Region / coordinates */}
        <span className="text-[13px] font-semibold text-white truncate">{locationLabel}</span>

        <div className="w-px h-4 bg-[#1C3A63] shrink-0" />

        {/* Active date */}
        <span className="text-[12px] font-mono text-[#8EA4C8] shrink-0">{dateLabel}</span>

        {/* Spacer */}
        <div className="flex-1" />
      </div>

      {/* ── Main content: 60 / 40 split ──────────────────────────────────── */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ height: 'calc(100vh - 100px)' /* AppNav 56px + context bar 44px */ }}
      >
        {/* Left 60% — OceanSlab + scientific controls, NO MapView/Globe */}
        <div className="w-[60%] h-full overflow-hidden">
          <OceanWorkspace
            showMap={false}
            selectedPoint={activePointQuery}
            onPointClick={handlePointClick}
          />
        </div>

        {/* Right 40% — Ocean Intelligence Panel (Phase 3A: Point Data live) */}
        <div className="w-[40%] h-full overflow-hidden">
          <OceanIntelligencePanel
            point={effectivePoint}
            region={regionName}
          />
        </div>
      </div>

      {/* Developer panel */}
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

      {/* Floating Copilot Overlay */}
      <OceanStreamCopilot selectedPoint={activePointQuery} />
    </div>
  );
}
