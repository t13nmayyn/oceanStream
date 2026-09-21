/**
 * LightweightGlobeView — Phase 2B
 *
 * Globe with 6 labeled HTML markers. No snapshot/argo/slab loads.
 * Hover is debounced (300ms) to prevent request spam in SummarySidebar.
 * onClick passes full { id, name, lat, lng, depth, bbox } to parent.
 * Custom Region marker does NOT navigate — handled by parent.
 */
import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import Globe from 'react-globe.gl';

// Major Ocean Basin & Landmark Labels for orientation
const OCEAN_LABELS = [
  { lat: 16.5, lng: 64.0, text: 'Arabian Sea', color: '#38bdf8', size: 1.3 },
  { lat: 15.0, lng: 88.5, text: 'Bay of Bengal', color: '#34d399', size: 1.3 },
  { lat: -5.0, lng: 78.0, text: 'Equatorial Indian Ocean', color: '#818cf8', size: 1.4 },
  { lat: 9.0, lng: 52.5, text: 'Somali Upwelling', color: '#00ffff', size: 1.1 },
  { lat: -32.0, lng: 34.0, text: 'Agulhas Current', color: '#ec4899', size: 1.1 },
  { lat: -52.0, lng: 75.0, text: 'Southern Ocean (ACC)', color: '#00e5ff', size: 1.4 },
  { lat: 3.2, lng: 73.2, text: 'Maldives', color: '#94a3b8', size: 0.9 },
  { lat: 11.5, lng: 93.0, text: 'Andaman Sea', color: '#94a3b8', size: 0.9 },
  { lat: 10.0, lng: 72.0, text: 'Lakshadweep Sea', color: '#94a3b8', size: 0.9 },
];

/** 6 region markers. Custom Region has no bbox (no direct navigation). */
export const REGION_MARKERS = [
  { id: 'arabian-sea',     name: 'Arabian Sea',      lat: 16.5, lng: 64.0, depth: 0, bbox: { south: 10,  north: 25, west: 55, east: 75 } },
  { id: 'bay-of-bengal',   name: 'Bay of Bengal',    lat: 15.0, lng: 88.5, depth: 0, bbox: { south: 5,   north: 22, west: 80, east: 98 } },
  { id: 'indian-ocean',    name: 'Indian Ocean',     lat: -5.0, lng: 78.0, depth: 0, bbox: { south: -20, north: 10, west: 55, east: 95 } },
  { id: 'andaman-sea',     name: 'Andaman Sea',      lat: 11.5, lng: 93.0, depth: 0, bbox: { south: 5,   north: 15, west: 90, east: 98 } },
  { id: 'lakshadweep-sea', name: 'Lakshadweep Sea',  lat: 10.0, lng: 72.0, depth: 0, bbox: { south: 5,   north: 15, west: 68, east: 78 } },
  { id: 'custom-region',   name: 'Custom Region',    lat:  0.0, lng: 80.0, depth: 0 },
];

const HOVER_DEBOUNCE_MS = 300;

const LightweightGlobeView = forwardRef(function LightweightGlobeView(
  { onMarkerClick, onMarkerHover },
  ref
) {
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const hoveredIdRef = useRef(null);
  const hoverTimerRef = useRef(null);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) setDimensions({ width: w, height: h });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Clean up hover timer on unmount
  useEffect(() => () => clearTimeout(hoverTimerRef.current), []);

  useImperativeHandle(ref, () => ({
    flyTo(lon, lat, height = 2.0) {
      globeRef.current?.pointOfView({ lat, lng: lon, altitude: height }, 1500);
    },
    zoomIn() {
      const pov = globeRef.current?.pointOfView();
      if (pov) globeRef.current?.pointOfView({ ...pov, altitude: Math.max(0.35, pov.altitude * 0.75) }, 400);
    },
    zoomOut() {
      const pov = globeRef.current?.pointOfView();
      if (pov) globeRef.current?.pointOfView({ ...pov, altitude: Math.min(5.0, pov.altitude * 1.35) }, 400);
    },
    resetFocus() {
      globeRef.current?.pointOfView({ lat: 14.5, lng: 78.5, altitude: 2.2 }, 1500);
    },
  }));

  const handleGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView({ lat: 14.5, lng: 78.5, altitude: 2.2 }, 1000);
    const controls = globe.controls();
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.8;
      controls.zoomSpeed = 1.2;
      controls.minDistance = 120;
      controls.maxDistance = 700;
    }
  }, []);

  /**
   * Debounced hover — fires onMarkerHover at most once per HOVER_DEBOUNCE_MS.
   * Prevents SummarySidebar from firing a new fetch on every mouse-move pixel.
   */
  const handleMarkerEnter = useCallback((d) => {
    clearTimeout(hoverTimerRef.current);
    if (hoveredIdRef.current === d.id) return; // already hovered, no-op
    hoverTimerRef.current = setTimeout(() => {
      hoveredIdRef.current = d.id;
      onMarkerHover?.(d);
    }, HOVER_DEBOUNCE_MS);
  }, [onMarkerHover]);

  const handleMarkerLeave = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    hoveredIdRef.current = null;
    // Intentionally do NOT call onMarkerHover(null) — sidebar retains last value
  }, []);

  const handleMarkerClick = useCallback((d) => {
    globeRef.current?.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.2 }, 1200);
    onMarkerClick?.(d); // full marker object: { id, name, lat, lng, depth, bbox }
  }, [onMarkerClick]);

  /**
   * Creates a persistent HTML marker element: white circle + teal border + label below.
   * No hover popup — label is always visible. Click delegates to handleMarkerClick.
   */
  const createHtmlMarker = useCallback((d) => {
    const isCustom = d.id === 'custom-region';
    const el = document.createElement('div');
    el.style.pointerEvents = 'auto';
    el.style.cursor = isCustom ? 'default' : 'pointer';
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
        <div style="
          width:14px;height:14px;border-radius:50%;
          background:white;
          border:2.5px solid ${isCustom ? '#94a3b8' : '#10b981'};
          box-shadow:0 2px 6px rgba(0,0,0,0.25);
        "></div>
        <div style="
          margin-top:5px;
          background:rgba(255,255,255,0.92);
          border:1px solid ${isCustom ? '#cbd5e1' : '#10b981'};
          color:${isCustom ? '#64748b' : '#0f172a'};
          font-size:10px;font-weight:700;
          padding:2px 7px;border-radius:5px;
          white-space:nowrap;
          box-shadow:0 1px 6px rgba(0,0,0,0.12);
          backdrop-filter:blur(4px);
          letter-spacing:0.02em;
        ">${d.name}</div>
      </div>
    `;
    el.onclick = (e) => { e.stopPropagation(); handleMarkerClick(d); };
    el.onmouseenter = () => handleMarkerEnter(d);
    el.onmouseleave = () => handleMarkerLeave();
    return el;
  }, [handleMarkerClick, handleMarkerEnter, handleMarkerLeave]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing select-none overflow-hidden bg-slate-50"
    >
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        showAtmosphere={true}
        atmosphereColor="#93c5fd"
        atmosphereAltitude={0.22}
        enablePointerInteraction={true}
        onGlobeReady={handleGlobeReady}

        // HTML markers — white circle, teal border, label below, no popup
        htmlElementsData={REGION_MARKERS}
        htmlLat="lat"
        htmlLng="lng"
        htmlElement={createHtmlMarker}

        // Floating ocean basin labels
        labelsData={OCEAN_LABELS}
        labelLat="lat"
        labelLng="lng"
        labelText="text"
        labelColor="color"
        labelSize="size"
        labelAltitude={0.012}
        labelResolution={2}
        labelIncludeDot={true}
        labelDotRadius={0.3}
      />
    </div>
  );
});

export default LightweightGlobeView;
