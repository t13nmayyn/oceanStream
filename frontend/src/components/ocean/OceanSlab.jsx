import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const DEPTH_BINS = [0, 10, 50, 100, 200, 500, 1000];

// ── Scientific colour ramps ────────────────────────────────────────────────
const STOPS = {
  temperature:  ['#0033cc', '#00b4d8', '#00e08c', '#ffd166', '#ff7700', '#f54375'],
  salinity:     ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#e0aaff', '#7209b7'],
  currents:     ['#051923', '#006494', '#00a6fb', '#0582ca', '#00f5d4', '#70e000'],
  chlorophyll:  ['#081c15', '#1b4332', '#2d6a4f', '#52b788', '#95d5b2', '#d8f3dc'],
  oxygen:       ['#3a0ca3', '#4361ee', '#4cc9f0', '#70e000', '#ffaa00', '#ff0054'],
  ph:           ['#d00000', '#e85d04', '#ffba08', '#52b788', '#0077b6', '#03045e'],
  nitrate:      ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd', '#38b000'],
  pco2:         ['#f72585', '#b5179e', '#7209b7', '#560bad', '#480ca8', '#3a0ca3'],
  // Anomaly ramp: cold=blue → normal=teal → hot=red
  anomaly:      ['#0022ff', '#0088cc', '#00ccaa', '#666666', '#ff6600', '#ff0022'],
};

// Copernicus physical depth levels — used for vertical mapping
const COPERNICUS_DEPTHS = [0.494, 9.573, 49.324, 98.96, 203.44, 494.3, 1000.0];

export const TEMP_RELIEF_SCALE = 1.8;

// Map a (value, depth_m) → scene Y position
// verticalExag controls how much temperature relief is added on top of depth
export function computeElevation(temperature, min_temp, temp_range, depth_m, verticalExag = 35) {
  const normalizedTemp = Math.max(0, Math.min(1, (temperature - min_temp) / Math.max(temp_range, 0.0001)));
  const tempRelief = normalizedTemp * TEMP_RELIEF_SCALE * (verticalExag / 35);
  const depthNorm = Math.pow(Math.min(Math.max(0, depth_m), 1000) / 1000, 0.45);
  const depthBaseY = 4.8 - depthNorm * 9.6;
  return depthBaseY + (tempRelief - TEMP_RELIEF_SCALE * 0.5);
}

// Pure depth → Y (no temperature warp) — used for column base/top extent
function depthToY(depth_m) {
  const depthNorm = Math.pow(Math.min(Math.max(0, depth_m), 1000) / 1000, 0.45);
  return 4.8 - depthNorm * 9.6;
}

function valueFor(point, variable) {
  const aliases = {
    temperature:  ['temperature_c', 'temperature', 'thetao', 'temp'],
    salinity:     ['salinity_psu', 'salinity', 'so'],
    currents:     ['current_speed', 'velocity'],
    chlorophyll:  ['chlorophyll_mgl', 'chlorophyll', 'chl'],
    oxygen:       ['oxygen_mmolm3', 'oxygen', 'dissolved_oxygen', 'o2'],
    ph:           ['ph', 'pH'],
    nitrate:      ['nitrate_mmolm3', 'nitrate', 'no3'],
    pco2:         ['pco2_uatm', 'pco2', 'spco2'],
  };
  if (variable === 'currents') {
    return Math.hypot(
      Number(point?.current_u_ms ?? point?.uo ?? 0),
      Number(point?.current_v_ms ?? point?.vo ?? 0),
    );
  }
  const key = (aliases[variable] || aliases.temperature).find((n) => point?.[n] != null);
  return Number(point?.[key] ?? 0);
}

function interpolateColor(t, palette) {
  const clampedT = Math.max(0, Math.min(1, t));
  const segCount = palette.length - 1;
  const seg = Math.min(Math.floor(clampedT * segCount), segCount - 1);
  const segT = (clampedT - seg / segCount) * segCount;
  return new THREE.Color(palette[seg]).lerp(new THREE.Color(palette[seg + 1]), segT);
}

function colorFor(value, min, max, variable) {
  const palette = STOPS[variable] || STOPS.temperature;
  const t = (value - min) / Math.max(max - min, 0.0001);
  return interpolateColor(t, palette);
}

// Anomaly colour: maps anomaly_c to a diverging blue↔red scale
function anomalyColor(anomalyC, threshold = 2.0) {
  // t=0 coldest(-threshold*2), t=0.5 normal(0), t=1 hottest(+threshold*2)
  const twoThr = Math.max(threshold * 2, 0.001);
  const t = Math.max(0, Math.min(1, (anomalyC + twoThr) / (twoThr * 2)));
  return interpolateColor(t, STOPS.anomaly);
}

// ─────────────────────────────────────────────────────────────────────────────
// buildContinuousVolume:
//   Given sorted depth slices (shallow → deep), build ONE continuous
//   3D geometry where each (lat,lon) column is extruded from the top
//   depth level Y down to the bottom depth level Y, with smooth colour
//   interpolation along the column.
//
//   Strategy: for each grid cell, for each consecutive pair of depth levels,
//   emit a BoxGeometry-like quad (two triangles) that spans Y_top → Y_bottom.
//   All quads share a merged BufferGeometry → ONE draw call, ONE connected object.
// ─────────────────────────────────────────────────────────────────────────────
function buildContinuousVolume(slicesToRender, current, modelWidth, modelDepth) {
  const bounds = current.bounds || { west: 70, east: 85, south: 8, north: 22 };
  const west  = Number(bounds.west  ?? bounds.lon_min ?? 70);
  const east  = Number(bounds.east  ?? bounds.lon_max ?? 85);
  const south = Number(bounds.south ?? bounds.lat_min ?? 8);
  const north = Number(bounds.north ?? bounds.lat_max ?? 22);

  const lonSpan = Math.max(east - west, 0.0001);
  const latSpan = Math.max(north - south, 0.0001);

  // Collect all values for global colour normalization
  const allValues = [];
  slicesToRender.forEach((s) => {
    (s.points || []).forEach((pt) => allValues.push(valueFor(pt, current.variable)));
  });
  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 1;
  const anomalyThr = current.anomalyThreshold || 2.0;

  // Sort slices shallow→deep
  const sorted = [...slicesToRender].sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));

  // Build a spatial index: key="lat_lon" → array of {depth_m, value, point, sliceIdx}
  // We pick the surface (shallowest) grid to define column positions
  const columnMap = new Map();

  // Use the shallowest slice to define the lat/lon grid
  const refSlice = sorted[0];
  const refPts = refSlice?.points || [];

  // Determine column step (adaptive based on grid density)
  const gridSize = refPts.length;
  const colStep = Math.max(1, Math.floor(gridSize / 1400)); // cap at ~1400 columns

  const sampledPts = refPts.filter((_, i) => i % colStep === 0);

  sampledPts.forEach((refPt) => {
    const latKey = Math.round(Number(refPt.lat) * 10) / 10;
    const lonKey = Math.round(Number(refPt.lon) * 10) / 10;
    const key = `${latKey}_${lonKey}`;
    columnMap.set(key, { lat: Number(refPt.lat), lon: Number(refPt.lon), levels: [] });
  });

  // Populate each column with values at each depth
  sorted.forEach((slice, sIdx) => {
    const depth_m = Number(slice.depth_m ?? 0);
    (slice.points || []).forEach((pt) => {
      const latKey = Math.round(Number(pt.lat) * 10) / 10;
      const lonKey = Math.round(Number(pt.lon) * 10) / 10;
      const key = `${latKey}_${lonKey}`;
      if (columnMap.has(key)) {
        columnMap.get(key).levels.push({
          depth_m,
          value: valueFor(pt, current.variable),
          anomaly_c: pt.anomaly_c ?? null,
          point: pt,
          sliceIdx: sIdx,
        });
      }
    });
  });

  // Filter columns that have at least 2 depth levels
  const columns = [...columnMap.values()].filter((col) => col.levels.length >= 2);
  if (columns.length === 0) return null;

  // Each inter-depth segment = 1 rectangular column pillar (4 faces → 8 triangles, simplified to 2 faces)
  // We'll render each column as a vertical line of connected boxes using BufferGeometry
  // Simple approach: for each column, for each depth pair, emit a box (4 verts, 2 tris)
  // facing toward camera (billboarded in XZ with flat top/bottom)

  const exag = current.verticalExaggeration ?? 35;
  const anomalyMode = current.anomalyMode ?? false;

  // Compute adaptive column horizontal dimensions so pillars touch/tile naturally
  const numCols = columns.length;
  const cellHW = Math.max(0.12, Math.min(0.40, (modelWidth / Math.sqrt(numCols * (modelWidth / modelDepth))) * 0.48));
  const cellHD = Math.max(0.12, Math.min(0.40, (modelDepth / Math.sqrt(numCols * (modelDepth / modelWidth))) * 0.48));

  // Count total vertices and indices
  // For each column with L levels: L * 4 vertices, (L - 1) * 8 side triangles + 2 top + 2 bottom = (L - 1) * 24 + 12 indices
  let totalVerts = 0;
  let totalIndices = 0;
  columns.forEach((col) => {
    const L = col.levels.length;
    totalVerts += L * 4;
    totalIndices += (L - 1) * 24 + 12;
  });

  const positions = new Float32Array(totalVerts * 3);
  const colors    = new Float32Array(totalVerts * 3);
  const indices   = [];

  let vPtr = 0;

  columns.forEach((col) => {
    const nx = ((col.lon - west) / lonSpan - 0.5) * modelWidth;
    const nz = ((col.lat - south) / latSpan - 0.5) * modelDepth;

    const levels = col.levels.sort((a, b) => a.depth_m - b.depth_m);
    const L = levels.length;
    const colStartV = vPtr;

    // 1. Emit 4 vertices for each depth level
    for (let li = 0; li < L; li++) {
      const lv = levels[li];
      const y = computeElevation(lv.value, minVal, maxVal - minVal, lv.depth_m, exag);

      let c;
      if (anomalyMode) {
        const aVal = lv.anomaly_c ?? (lv.value - (minVal + maxVal) / 2);
        c = anomalyColor(aVal, anomalyThr);
      } else {
        c = colorFor(lv.value, minVal, maxVal, current.variable);
      }

      // Threshold filter override
      if (
        current.threshold?.enabled &&
        ((current.threshold.operator === '>' && lv.value > current.threshold.value) ||
          (current.threshold.operator === '<' && lv.value < current.threshold.value) ||
          Math.abs(lv.value - current.threshold.value) <= current.threshold.tolerance)
      ) {
        c.set('#ffeb3b');
      }

      // v0: North-West
      positions[vPtr * 3]     = nx - cellHW;
      positions[vPtr * 3 + 1] = y;
      positions[vPtr * 3 + 2] = nz - cellHD;
      colors[vPtr * 3]     = c.r;
      colors[vPtr * 3 + 1] = c.g;
      colors[vPtr * 3 + 2] = c.b;
      vPtr++;

      // v1: North-East
      positions[vPtr * 3]     = nx + cellHW;
      positions[vPtr * 3 + 1] = y;
      positions[vPtr * 3 + 2] = nz - cellHD;
      colors[vPtr * 3]     = c.r;
      colors[vPtr * 3 + 1] = c.g;
      colors[vPtr * 3 + 2] = c.b;
      vPtr++;

      // v2: South-East
      positions[vPtr * 3]     = nx + cellHW;
      positions[vPtr * 3 + 1] = y;
      positions[vPtr * 3 + 2] = nz + cellHD;
      colors[vPtr * 3]     = c.r;
      colors[vPtr * 3 + 1] = c.g;
      colors[vPtr * 3 + 2] = c.b;
      vPtr++;

      // v3: South-West
      positions[vPtr * 3]     = nx - cellHW;
      positions[vPtr * 3 + 1] = y;
      positions[vPtr * 3 + 2] = nz + cellHD;
      colors[vPtr * 3]     = c.r;
      colors[vPtr * 3 + 1] = c.g;
      colors[vPtr * 3 + 2] = c.b;
      vPtr++;
    }

    // 2. Emit side wall triangles connecting level li to level li + 1
    for (let li = 0; li < L - 1; li++) {
      const topOff = colStartV + li * 4;
      const botOff = colStartV + (li + 1) * 4;

      const t0 = topOff + 0, t1 = topOff + 1, t2 = topOff + 2, t3 = topOff + 3;
      const b0 = botOff + 0, b1 = botOff + 1, b2 = botOff + 2, b3 = botOff + 3;

      // North side: t0, t1, b1, b0
      indices.push(t0, t1, b1);
      indices.push(t0, b1, b0);

      // East side: t1, t2, b2, b1
      indices.push(t1, t2, b2);
      indices.push(t1, b2, b1);

      // South side: t2, t3, b3, b2
      indices.push(t2, t3, b3);
      indices.push(t2, b3, b2);

      // West side: t3, t0, b0, b3
      indices.push(t3, t0, b0);
      indices.push(t3, b0, b3);
    }

    // 3. Top cap (surface layer li = 0)
    const top0 = colStartV;
    indices.push(top0 + 0, top0 + 3, top0 + 2);
    indices.push(top0 + 0, top0 + 2, top0 + 1);

    // 4. Bottom cap (deepest layer li = L - 1)
    const bot0 = colStartV + (L - 1) * 4;
    indices.push(bot0 + 0, bot0 + 1, bot0 + 2);
    indices.push(bot0 + 0, bot0 + 2, bot0 + 3);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, vPtr * 3), 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors.subarray(0, vPtr * 3), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

// ─────────────────────────────────────────────────────────────────────────────
// OceanSlab component
// ─────────────────────────────────────────────────────────────────────────────
export default function OceanSlab({
  depthSlices = [],
  volumeData = null,
  grid = [],
  floats = [],
  variable = 'temperature',
  depth = 0,
  dataDepth = depth,
  bounds,
  opacity = 0.95,
  verticalExaggeration = 35,
  threshold,
  source,
  dataSource,
  backupDate,
  regionName = 'Indian Ocean',
  anomalyMode = false,
  anomalyThreshold = 2.0,
  loading = false,
  onSelectMarker,
}) {
  const mountRef   = useRef(null);
  const sceneRef   = useRef(null);
  const hudRef     = useRef(null);
  const tooltipRef = useRef(null);

  const dataRef = useRef({
    depthSlices, volumeData, grid, floats, variable, depth, dataDepth,
    bounds, opacity, verticalExaggeration, threshold, source, dataSource,
    backupDate, regionName, anomalyMode, anomalyThreshold, loading,
  });

  useEffect(() => {
    dataRef.current = {
      depthSlices, volumeData, grid, floats, variable, depth, dataDepth,
      bounds, opacity, verticalExaggeration, threshold, source, dataSource,
      backupDate, regionName, anomalyMode, anomalyThreshold, loading,
    };
  }, [
    depthSlices, volumeData, grid, floats, variable, depth, dataDepth,
    bounds, opacity, verticalExaggeration, threshold, source, dataSource,
    backupDate, regionName, anomalyMode, anomalyThreshold, loading,
  ]);

  // ── Main Three.js setup (runs once) ────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b14');
    scene.fog = new THREE.FogExp2('#070b14', 0.018);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 14, 26);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor('#070b14', 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // HUD
    const hud = document.createElement('div');
    hud.style.cssText = [
      'position:absolute', 'top:12px', 'left:14px', 'pointer-events:none',
      'font-family:ui-sans-serif,system-ui,sans-serif', 'color:#e2e8f0',
      'background:rgba(11,30,61,0.85)', 'backdrop-filter:blur(6px)',
      'padding:8px 12px', 'border-radius:8px', 'border:1px solid rgba(28,58,99,0.7)',
      'font-size:12px', 'z-index:10', 'display:flex', 'flex-direction:column',
      'gap:3px', 'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
    ].join(';');
    mount.appendChild(hud);
    hudRef.current = hud;

    // Loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = [
      'position:absolute', 'inset:0', 'display:none', 'align-items:center',
      'justify-content:center', 'flex-direction:column', 'gap:12px',
      'background:rgba(7,11,20,0.78)', 'z-index:30', 'backdrop-filter:blur(3px)',
    ].join(';');
    loadingOverlay.innerHTML = `
      <div style="width:48px;height:48px;border:3px solid #1C3A63;border-top-color:#00f5d4;border-radius:50%;animation:oceanSpin 0.9s linear infinite;"></div>
      <div style="color:#00f5d4;font-size:13px;font-weight:600;letter-spacing:0.5px;">Fetching ocean data…</div>
      <div id="loading-sub" style="color:#8EA4C8;font-size:11px;max-width:240px;text-align:center;">Checking L1 → L2 → Backup → Copernicus</div>
    `;
    // Spin keyframes via style tag
    const styleEl = document.createElement('style');
    styleEl.textContent = '@keyframes oceanSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(styleEl);
    mount.appendChild(loadingOverlay);

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.style.cssText = [
      'position:absolute', 'pointer-events:none', 'background:rgba(7,16,33,0.92)',
      'border:1px solid #00f5d4', 'color:#fff', 'padding:6px 10px',
      'border-radius:6px', 'font-size:11px', 'font-family:monospace', 'z-index:20',
      'display:none', 'transform:translate(-50%,-120%)', 'box-shadow:0 2px 10px rgba(0,245,212,0.3)',
      'white-space:nowrap',
    ].join(';');
    mount.appendChild(tooltip);
    tooltipRef.current = tooltip;

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controls.minDistance = 6;
    controls.maxDistance = 70;
    controls.update();

    // Lighting
    scene.add(new THREE.AmbientLight('#ffffff', 2.0));
    const sun = new THREE.DirectionalLight('#e0f2fe', 2.4);
    sun.position.set(16, 30, 20);
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#00f5d4', 1.0);
    fill.position.set(-18, -8, -14);
    scene.add(fill);

    // Scene dimensions
    const modelWidth  = 18;
    const modelDepth  = 14;
    const modelHeight = 10.4;

    // Cage wireframe
    const cageGeo = new THREE.BoxGeometry(modelWidth, modelHeight, modelDepth);
    const cageMat = new THREE.MeshBasicMaterial({ color: '#1e3a5f', wireframe: true, transparent: true, opacity: 0.3 });
    scene.add(new THREE.Mesh(cageGeo, cageMat));

    // Floor grid
    const floorGrid = new THREE.GridHelper(modelWidth, 12, '#00f5d4', '#152e4d');
    floorGrid.position.y = -modelHeight / 2;
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.28;
    scene.add(floorGrid);

    // Depth ruler lines (right edge)
    const RULER_DEPTHS = [0, 50, 100, 200, 500, 1000];
    const rulerMat = new THREE.LineBasicMaterial({ color: '#1e4a80', transparent: true, opacity: 0.5 });
    RULER_DEPTHS.forEach((d) => {
      const y = depthToY(d);
      const rGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(modelWidth / 2 + 0.1, y, 0),
        new THREE.Vector3(modelWidth / 2 + 0.7, y, 0),
      ]);
      scene.add(new THREE.Line(rGeo, rulerMat));
    });

    // Active depth plane (thin translucent horizontal slab)
    const planeMat = new THREE.MeshBasicMaterial({ color: '#00f5d4', transparent: true, opacity: 0.12, side: THREE.DoubleSide });
    const planeGeo = new THREE.PlaneGeometry(modelWidth, modelDepth);
    planeGeo.rotateX(Math.PI / 2);
    const activePlane = new THREE.Mesh(planeGeo, planeMat);
    scene.add(activePlane);

    // Argo float markers
    const floatGeo = new THREE.SphereGeometry(0.34, 14, 14);
    const floatMat = new THREE.MeshStandardMaterial({ color: '#00f5d4', emissive: '#00e5ff', emissiveIntensity: 0.9, roughness: 0.1 });
    const markerMesh = new THREE.InstancedMesh(floatGeo, floatMat, 256);
    markerMesh.count = 0;
    scene.add(markerMesh);

    const tetherGeo = new THREE.BufferGeometry();
    const tetherPos = new Float32Array(256 * 2 * 3);
    tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPos, 3));
    const tetherMat = new THREE.LineBasicMaterial({ color: '#00f5d4', transparent: true, opacity: 0.35 });
    scene.add(new THREE.LineSegments(tetherGeo, tetherMat));

    // Current flow arrows
    const arrowGeo = new THREE.ConeGeometry(0.14, 0.44, 6);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshStandardMaterial({ color: '#00f5d4', emissive: '#0077b6', emissiveIntensity: 0.8 });
    const vectorMesh = new THREE.InstancedMesh(arrowGeo, arrowMat, 1200);
    vectorMesh.count = 0;
    vectorMesh.visible = false;
    scene.add(vectorMesh);

    // ── The one continuous ocean volume mesh (replaced on update) ───────────
    let volumeMesh = null;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredFloat = null;

    // ── UPDATE function: rebuilds the continuous volume ─────────────────────
    const update = () => {
      const cur = dataRef.current;

      // Show/hide loading overlay
      const isLoading = cur.loading === true;
      loadingOverlay.style.display = isLoading ? 'flex' : 'none';

      const rawSlices = cur.depthSlices?.length
        ? cur.depthSlices
        : cur.volumeData?.depth_slices || [];

      // If no slices from API, synthesize from surface grid with thermocline decay
      let slicesToRender = [];
      const baseGrid = cur.grid || [];

      if (rawSlices.length > 0) {
        slicesToRender = rawSlices;
      } else if (baseGrid.length > 0) {
        const synthDepths = [0, 50, 100, 200, 500, 1000];
        slicesToRender = synthDepths.map((dM) => {
          const decay = Math.exp(-dM / 220.0);
          return {
            depth_m: dM,
            points: baseGrid.map((p) => ({
              ...p,
              depth_m: dM,
              temperature_c: 4.0 + (Number(p.temperature_c ?? p.value ?? 26.0) - 4.0) * decay,
              salinity_psu:  34.7 + (Number(p.salinity_psu ?? 34.5) - 34.7) * Math.exp(-dM / 350.0),
              current_u_ms:  (p.current_u_ms ?? 0) * decay,
              current_v_ms:  (p.current_v_ms ?? 0) * decay,
            })),
          };
        });
      }

      // ── Remove previous volume mesh ──────────────────────────────────────
      if (volumeMesh) {
        scene.remove(volumeMesh);
        volumeMesh.geometry.dispose();
        volumeMesh.material.dispose();
        volumeMesh = null;
      }

      if (!slicesToRender.length) {
        // Update HUD with empty state
        if (hudRef.current) {
          hudRef.current.innerHTML = `
            <div style="font-weight:700;color:#38bdf8;">3D OCEAN VOLUME · ${(cur.regionName || '').toUpperCase()}</div>
            <div style="font-size:11px;color:#94a3b8;">No data loaded — waiting for cache…</div>
          `;
        }
        return;
      }

      // Sort slices shallow → deep
      const sorted = [...slicesToRender].sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));
      const minDepth = sorted[0]?.depth_m ?? 0;
      const maxDepthVal = sorted[sorted.length - 1]?.depth_m ?? 1000;
      const layerCount = sorted.length;

      // Build the single continuous geometry
      const geo = buildContinuousVolume(sorted, {
        ...cur,
        bounds: cur.bounds || { west: 70, east: 85, south: 8, north: 22 },
      }, modelWidth, modelDepth);

      if (geo) {
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          opacity: cur.opacity ?? 0.92,
          roughness: 0.35,
          metalness: 0.08,
          side: THREE.DoubleSide,
        });
        volumeMesh = new THREE.Mesh(geo, mat);
        scene.add(volumeMesh);
      }

      // Active depth plane position
      const selDepth = Number(cur.depth || 0);
      activePlane.position.y = depthToY(selDepth);

      // ── Current vectors ───────────────────────────────────────────────────
      const bounds = cur.bounds || { west: 70, east: 85, south: 8, north: 22 };
      const west  = Number(bounds.west  ?? bounds.lon_min ?? 70);
      const east  = Number(bounds.east  ?? bounds.lon_max ?? 85);
      const south = Number(bounds.south ?? bounds.lat_min ?? 8);
      const north = Number(bounds.north ?? bounds.lat_max ?? 22);
      const lonSpan = Math.max(east - west, 0.0001);
      const latSpan = Math.max(north - south, 0.0001);

      const allValues = [];
      sorted.forEach((s) => (s.points || []).forEach((p) => allValues.push(valueFor(p, cur.variable))));
      const minVal = allValues.length ? Math.min(...allValues) : 0;
      const maxVal = allValues.length ? Math.max(...allValues) : 1;
      const valRange = Math.max(maxVal - minVal, 0.0001);

      if (cur.variable === 'currents') {
        vectorMesh.visible = true;
        let arrowIdx = 0;
        const surfaceSlice = sorted[0];
        const pts = surfaceSlice?.points || [];
        const arrowStep = Math.max(1, Math.floor(pts.length / 1200));
        const mtx = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const rot = new THREE.Euler();
        const quat = new THREE.Quaternion();
        const sc = new THREE.Vector3();

        for (let i = 0; i < pts.length && arrowIdx < 1200; i += arrowStep) {
          const pt = pts[i];
          const u = Number(pt.current_u_ms ?? 0);
          const v = Number(pt.current_v_ms ?? 0);
          const speed = Math.hypot(u, v);
          if (speed < 0.005) continue;

          const nx = ((Number(pt.lon) - west) / lonSpan - 0.5) * modelWidth;
          const nz = ((Number(pt.lat) - south) / latSpan - 0.5) * modelDepth;
          const yPos = depthToY(0) + 0.5;

          const angle = Math.atan2(u, v);
          rot.set(0, angle, 0);
          quat.setFromEuler(rot);
          pos.set(nx, yPos, nz);
          sc.set(1, 1, Math.min(2.5, 0.8 + speed * 4));
          mtx.compose(pos, quat, sc);
          vectorMesh.setMatrixAt(arrowIdx, mtx);
          arrowIdx++;
        }
        vectorMesh.count = arrowIdx;
        vectorMesh.instanceMatrix.needsUpdate = true;
      } else {
        vectorMesh.visible = false;
      }

      // ── Argo Float Markers ────────────────────────────────────────────────
      const floatList = cur.floats || [];
      const floatCount = Math.min(floatList.length, 256);
      markerMesh.count = floatCount;

      const mtx2 = new THREE.Matrix4();
      const pos2 = new THREE.Vector3();
      const quat2 = new THREE.Quaternion();
      const sc2   = new THREE.Vector3(1.1, 1.1, 1.1);

      floatList.slice(0, floatCount).forEach((fl, idx) => {
        const fx = ((Number(fl.lng ?? fl.lon) - west) / lonSpan - 0.5) * modelWidth;
        const fz = ((Number(fl.lat)           - south) / latSpan - 0.5) * modelDepth;
        const flDepth = Number(fl.depth ?? fl.data_depth ?? 50);
        const fy = depthToY(flDepth);

        pos2.set(fx, fy, fz);
        mtx2.compose(pos2, quat2, sc2);
        markerMesh.setMatrixAt(idx, mtx2);

        // Tether
        const off = idx * 6;
        tetherPos[off]     = fx; tetherPos[off + 1] = depthToY(0); tetherPos[off + 2] = fz;
        tetherPos[off + 3] = fx; tetherPos[off + 4] = fy;          tetherPos[off + 5] = fz;
      });
      markerMesh.instanceMatrix.needsUpdate = true;
      tetherGeo.attributes.position.needsUpdate = true;

      // ── HUD ───────────────────────────────────────────────────────────────
      if (hudRef.current) {
        const srcLabel = cur.dataSource === 'copernicus_zarr'
          ? '🟢 Copernicus Live (L2)'
          : cur.dataSource === 'backup_cache'
          ? `📦 Copernicus Backup (${cur.backupDate || 'Stored'})`
          : cur.dataSource === 'analytical_demo'
          ? '🌐 Analytical Ocean Model'
          : '🌐 Cached Ocean Volume';

        const anomalyBadge = cur.anomalyMode
          ? '<span style="background:#f97316;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px;">ANOMALY</span>'
          : '';

        hudRef.current.innerHTML = `
          <div style="font-weight:700;color:#38bdf8;letter-spacing:0.5px;">
            3D OCEAN VOLUME · ${(cur.regionName || '').toUpperCase()}${anomalyBadge}
          </div>
          <div style="display:flex;gap:10px;font-size:11px;color:#94a3b8;">
            <span>Depth: <strong style="color:#00f5d4;">${selDepth}m</strong></span>
            <span>Layers: <strong style="color:#fff;">${layerCount} (${minDepth}–${maxDepthVal}m)</strong></span>
            <span>Variable: <strong style="color:#fff;text-transform:capitalize;">${cur.variable}</strong></span>
          </div>
          <div style="font-size:10.5px;color:#cbd5e1;margin-top:2px;">${srcLabel}</div>
        `;
      }
    };

    update();

    // Expose update to second useEffect
    sceneRef.current = { update };

    // Resize
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(mount);

    // Mouse hover
    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hit = raycaster.intersectObject(markerMesh)[0];
      if (hit && dataRef.current.floats[hit.instanceId]) {
        const fl = dataRef.current.floats[hit.instanceId];
        hoveredFloat = fl;
        renderer.domElement.style.cursor = 'pointer';
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'block';
          tooltipRef.current.style.left = `${e.clientX - rect.left}px`;
          tooltipRef.current.style.top  = `${e.clientY - rect.top}px`;
          const wmo  = fl.platform_number || fl.id || 'Argo';
          const temp = fl.temperature != null ? `${Number(fl.temperature).toFixed(2)}°C` : '—';
          const sal  = fl.salinity    != null ? `${Number(fl.salinity).toFixed(2)} PSU` : '—';
          const d    = fl.depth       != null ? `${Math.round(fl.depth)}m` : '0m';
          tooltipRef.current.innerHTML = `
            <strong>Float #${wmo}</strong><br/>
            Depth: ${d}<br/>
            Temp: ${temp} | Sal: ${sal}<br/>
            <span style="color:#38bdf8;font-size:10px;">Click for profile</span>
          `;
        }
      } else {
        hoveredFloat = null;
        renderer.domElement.style.cursor = 'default';
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      }
    };

    const onClick = () => { if (hoveredFloat) onSelectMarker?.(hoveredFloat); };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    // Animation loop
    let frame;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      obs.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      if (volumeMesh) { volumeMesh.geometry.dispose(); volumeMesh.material.dispose(); }
      cageGeo.dispose(); cageMat.dispose();
      planeGeo.dispose(); planeMat.dispose();
      floatGeo.dispose(); floatMat.dispose();
      arrowGeo.dispose(); arrowMat.dispose();
      tetherGeo.dispose(); tetherMat.dispose();
      rulerMat.dispose();
      renderer.dispose();
      styleEl.remove();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(hud))             mount.removeChild(hud);
      if (mount.contains(tooltip))         mount.removeChild(tooltip);
      if (mount.contains(loadingOverlay))  mount.removeChild(loadingOverlay);
      hudRef.current = null;
      tooltipRef.current = null;
    };
  }, [onSelectMarker]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-run update when any data prop changes
  useEffect(() => {
    sceneRef.current?.update();
  }, [
    depthSlices, volumeData, grid, floats, variable, depth, dataDepth,
    bounds, opacity, verticalExaggeration, threshold, source, dataSource,
    backupDate, regionName, anomalyMode, anomalyThreshold, loading,
  ]);

  return (
    <div
      ref={mountRef}
      className="ocean-slab-canvas w-full h-full relative overflow-hidden"
      aria-label="3D Ocean Volume — continuous depth field"
    />
  );
}

