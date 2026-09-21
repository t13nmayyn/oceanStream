/**
 * OceanDetailPage — Phase 2D
 *
 * Route: /ocean-detail
 *
 * Layout:
 *   AppNav (56px)
 *   Context bar: [← Back to Globe] | region/coords | date | [Anomaly toggle]
 *   ┌────────────────────────┬────────────────────────┐
 *   │  Left 60% — OceanSlab  │  Right 40% — Placeholder│
 *   │  + variable controls   │  (Phase 3 data panel)   │
 *   │  + depth slider        │                         │
 *   │  + time player         │                         │
 *   │  + colorbar            │                         │
 *   │  + coverage strip      │                         │
 *   │  + Argo markers (slab) │                         │
 *   └────────────────────────┴────────────────────────┘
 *
 * NO MapView, GlobeGlViewer, or Cesium globe on this page.
 * OceanWorkspace renders with showMap={false} — only the slab + controls.
 *
 * Context received from router state (primary) or URL params (fallback):
 *   { region, lat, lon, depth, date, bbox }
 * Depth + date are dispatched into AppContext for OceanWorkspace to pick up.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useApp, useAppDispatch } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApiHealth } from '../hooks/useApiHealth';
import { useDateControls } from '../hooks/useDateControls';
import { ArrowLeft, FlaskConical } from 'lucide-react';

import AppNav from '../components/navigation/AppNav';
import OceanWorkspace from '../components/ocean/OceanWorkspace';
import OceanStreamCopilot from '../components/copilot/OceanStreamCopilot';

// ── Right-panel placeholder ──────────────────────────────────────────────────

function DataPanelPlaceholder({ region, lat, lon }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/30 border-l border-slate-800/40 p-8">
      <div className="text-center max-w-[280px] w-full">
        <div className="text-[16px] font-semibold text-slate-300 mb-2">Ocean Intelligence</div>
        <div className="text-[12px] text-slate-500 leading-relaxed mb-8">
          Select a point, inspect the water column, or ask Ocean Assistant.
        </div>
        
        <div className="flex flex-col gap-2 text-left">
          {['Point Data', 'Timeline Analysis', 'Observations', 'AI Explanation'].map((row, i) => (
            <div key={row} className="px-4 py-3 rounded-xl bg-slate-800/40 border border-slate-700/50 text-[12px] font-medium text-slate-400 flex items-center justify-between shadow-sm">
              <span className="flex items-center gap-3">
                <span className="w-4 h-4 rounded bg-slate-700/50 flex items-center justify-center text-[9px] text-slate-500">{i + 1}</span>
                {row}
              </span>
              <div className="h-1.5 w-1.5 rounded-full bg-slate-700"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── OceanDetailPage ──────────────────────────────────────────────────────────

export default function OceanDetailPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { selectedDate, apiStatus, wsStatus, logs, activePointQuery } = useApp();

  useWebSocket();
  useApiHealth();
  useDateControls(); // initialises selectedDate from server; drives TimelineControl

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
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* ── AppNav ─────────────────────────────────────────────────────────── */}
      <AppNav />

      {/* ── Context bar ──────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm"
        style={{ height: '44px', marginTop: '56px' }}
      >
        {/* Back to Globe */}
        <button
          type="button"
          onClick={() => navigate('/explorer')}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-teal-400 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-800/60 shrink-0"
        >
          <ArrowLeft size={14} />
          Globe
        </button>

        <div className="w-px h-4 bg-slate-700 shrink-0" />

        {/* Region / coordinates */}
        <span className="text-[13px] font-semibold text-slate-200 truncate">{locationLabel}</span>

        <div className="w-px h-4 bg-slate-700 shrink-0" />

        {/* Active date */}
        <span className="text-[12px] font-mono text-slate-400 shrink-0">{dateLabel}</span>

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

        {/* Right 40% — Phase 2D placeholder; Phase 3 mounts real data panel here */}
        <div className="w-[40%] h-full overflow-hidden">
          <DataPanelPlaceholder
            region={regionName}
            lat={initialLat}
            lon={initialLon}
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
