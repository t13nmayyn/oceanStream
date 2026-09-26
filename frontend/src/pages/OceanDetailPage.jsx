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
import { PREDEFINED_OCEANS } from '../hooks/useOceanSnapshot';

import AppNav from '../components/navigation/AppNav';
import OceanWorkspace from '../components/ocean/OceanWorkspace';
import OceanStreamCopilot from '../components/copilot/OceanStreamCopilot';
import OceanIntelligencePanel from '../components/scientist/OceanIntelligencePanel';


// ── OceanDetailPage ──────────────────────────────────────────────────────────

export default function OceanDetailPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { selectedDate, selectedDepth, selectedVariable, apiStatus, wsStatus, logs, activePointQuery } = useApp();

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
  const initialVariable = searchParams.get('variable') ?? null;
  const initialBbox  = location.state?.bbox ?? null;

  const [selectedOcean, setSelectedOcean] = useState(() => {
    if (regionName) {
      const lower = regionName.toLowerCase();
      if (lower.includes('pacific')) return 'pacific';
      if (lower.includes('atlantic')) return 'atlantic';
      if (lower.includes('southern')) return 'southern';
      if (lower.includes('arctic')) return 'arctic';
      if (lower.includes('arabian')) return 'arabianSea';
      if (lower.includes('bengal')) return 'bayOfBengal';
      if (lower.includes('andaman')) return 'andamanSea';
      if (lower.includes('lakshadweep')) return 'lakshadweepSea';
      if (lower.includes('indian')) return 'indian';
    }
    return 'indian';
  });

  const [customBbox, setCustomBbox] = useState(null);

  const effectiveBbox = useMemo(() => {
    if (customBbox) return customBbox;
    if (initialBbox) return initialBbox;
    if (selectedOcean && PREDEFINED_OCEANS[selectedOcean]) {
      return PREDEFINED_OCEANS[selectedOcean];
    }
    if (initialLat != null && initialLon != null) {
      return {
        south: Math.max(-90, Number(initialLat) - 5),
        north: Math.min(90, Number(initialLat) + 5),
        west: Math.max(-180, Number(initialLon) - 5),
        east: Math.min(180, Number(initialLon) + 5),
      };
    }
    return PREDEFINED_OCEANS.indianOcean;
  }, [customBbox, initialBbox, selectedOcean, initialLat, initialLon]);

  const handleRegionChange = useCallback((newKey) => {
    setSelectedOcean(newKey);
    const preset = PREDEFINED_OCEANS[newKey];
    if (preset) {
      setCustomBbox(preset);
    }
  }, []);

  // Seed AppContext with incoming depth + variable + date + activePointQuery
  useEffect(() => {
    if (Number.isFinite(initialDepth)) {
      dispatch({ type: 'SET_DEPTH', payload: initialDepth });
    }
    if (initialVariable) {
      dispatch({ type: 'SET_SELECTED_VARIABLE', payload: initialVariable });
    }
    if (initialDate) {
      dispatch({ type: 'SET_DATE', payload: initialDate });
    }
    if (initialLat != null && initialLon != null) {
      dispatch({ type: 'SET_ACTIVE_POINT_QUERY', payload: { lat: Number(initialLat), lon: Number(initialLon) } });
    }
  }, []); // run once on mount

  // Sync state back to URL query parameters without page reload
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    let changed = false;

    if (selectedOcean && params.get('region') !== selectedOcean) {
      params.set('region', selectedOcean);
      changed = true;
    }
    if (selectedDepth != null && params.get('depth') !== String(selectedDepth)) {
      params.set('depth', String(selectedDepth));
      changed = true;
    }
    if (selectedVariable && params.get('variable') !== selectedVariable) {
      params.set('variable', selectedVariable);
      changed = true;
    }
    if (selectedDate && params.get('date') !== selectedDate) {
      params.set('date', selectedDate);
      changed = true;
    }

    if (changed) {
      setSearchParams(params, { replace: true });
    }
  }, [selectedOcean, selectedDepth, selectedVariable, selectedDate, searchParams, setSearchParams]);

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
    ? `Latest available: ${selectedDate}`
    : 'Live data updating';

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

        {/* Major Oceans & Regional Seas Selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <label htmlFor="ocean-select" className="text-[11px] font-semibold text-[#8EA4C8] uppercase tracking-wider">
            Ocean:
          </label>
          <select
            id="ocean-select"
            value={selectedOcean}
            onChange={(e) => handleRegionChange(e.target.value)}
            className="bg-[#102A4E] text-white text-[12px] font-semibold border border-[#1C3A63] rounded-md px-2.5 py-1 outline-none cursor-pointer hover:border-teal-400 focus:border-teal-400 transition-colors"
          >
            <optgroup label="Major Oceans">
              <option value="pacific">🌊 Pacific Ocean</option>
              <option value="atlantic">🌊 Atlantic Ocean</option>
              <option value="indian">🌊 Indian Ocean</option>
              <option value="southern">🌊 Southern Ocean</option>
              <option value="arctic">🌊 Arctic Ocean</option>
            </optgroup>
            <optgroup label="Regional Seas">
              <option value="arabianSea">📍 Arabian Sea</option>
              <option value="bayOfBengal">📍 Bay of Bengal</option>
              <option value="andamanSea">📍 Andaman Sea</option>
              <option value="lakshadweepSea">📍 Lakshadweep Sea</option>
            </optgroup>
          </select>
        </div>

        <div className="w-px h-4 bg-[#1C3A63] shrink-0" />

        {/* Active date */}
        <span className="text-[12px] font-mono text-[#8EA4C8] shrink-0">{dateLabel}</span>

        {/* Spacer */}
        <div className="flex-1" />
      </div>

      {/* ── Main content: 72 / 28 split (3D ocean model dominates) ─────── */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ height: 'calc(100vh - 100px)' /* AppNav 56px + context bar 44px */ }}
      >
        {/* Left 72% — OceanSlab 3D model + scientific controls, NO MapView/Globe */}
        <div className="w-[72%] h-full overflow-hidden">
          <OceanWorkspace
            showMap={false}
            selectedPoint={activePointQuery}
            onPointClick={handlePointClick}
            bbox={effectiveBbox}
            region={selectedOcean || regionName}
          />
        </div>

        {/* Right 28% — Supporting Ocean Intelligence Panel */}
        <div className="w-[28%] h-full overflow-hidden">
          <OceanIntelligencePanel
            point={effectivePoint}
            region={selectedOcean || regionName}
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
