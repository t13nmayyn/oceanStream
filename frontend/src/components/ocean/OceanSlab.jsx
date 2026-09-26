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
  anomaly:      ['#0022ff', '#0088cc', '#00ccaa', '#666666', '#ff6600', '#ff0022'],
};

// Copernicus physical depth levels
export const COPERNICUS_DEPTHS = [0.494, 9.573, 49.324, 98.96, 203.44, 494.3, 1000.0];

// Physical depth → 3D scene Y position.
// Ocean surface is at top (~+4.2), 1000m deep ocean is downward (~-4.2).
// Power scaling (0.45) preserves vertical resolution in the upper 200m thermocline.
export function depthToY(depth_m, verticalExag = 35) {
  const clamped = Math.min(Math.max(0, depth_m), 1000);
  const norm = Math.pow(clamped / 1000, 0.45);
  const scale = verticalExag / 35;
  return (4.2 - norm * 8.4) * scale;
}

// Subtle surface elevation and subsurface thermocline relief
export function computeElevation(value, min_val, val_range, depth_m, verticalExag = 55) {
  const baseY = depthToY(depth_m, verticalExag);
  const normVal = Math.max(0, Math.min(1, (value - min_val) / Math.max(val_range, 0.0001)));
  // Surface swell (existing)
  if (depth_m <= 5) {
    const swell = (normVal - 0.5) * 0.16 * (verticalExag / 35);
    return baseY + swell;
  }
  // Subsurface thermocline relief — deeper layers have less relief but still irregular
  const depthFactor = Math.exp(-depth_m / 400.0);
  const relief = (normVal - 0.5) * 0.28 * depthFactor * (verticalExag / 35);
  return baseY + relief;
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
  const val = point?.[key];
  if (val == null || val === '') return NaN;
  const num = Number(val);
  return Number.isFinite(num) ? num : NaN;
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

function anomalyColor(anomalyC, threshold = 2.0) {
  const twoThr = Math.max(threshold * 2, 0.001);
  const t = Math.max(0, Math.min(1, (anomalyC + twoThr) / (twoThr * 2)));
  return interpolateColor(t, STOPS.anomaly);
}

// Normalize longitude across the antimeridian (e.g. Pacific west=140, east=-70)
function normalizeLon(lon, west, isAntimeridian) {
  let l = Number(lon);
  if (isAntimeridian && l < west) {
    l += 360;
  }
  return l;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildOceanGeometry:
//   Constructs a single continuous volumetric ocean field:
//   - Follows actual latitude × longitude grid and available scientific values.
//   - Surface is an irregular natural ocean terrain matching real coastlines.
//   - Depth layers descend according to physical Copernicus depths.
//   - Adjacent depth samples are connected vertically with side walls/curtains.
//   - No bounding box / cage wireframe.
//   - No spiky artificial mountains.
//   - Missing / land / NaN regions remain completely transparent / empty.
//   - Works across all 5 oceans (Pacific antimeridian wrapping handled cleanly).
// ─────────────────────────────────────────────────────────────────────────────
function buildOceanGeometry(slicesToRender, current, modelWidth, modelDepth) {
  const bounds = current.bounds || { west: 70, east: 85, south: 8, north: 22 };
  const west  = Number(bounds.west  ?? bounds.lon_min ?? 70);
  const east  = Number(bounds.east  ?? bounds.lon_max ?? 85);
  const south = Number(bounds.south ?? bounds.lat_min ?? 8);
  const north = Number(bounds.north ?? bounds.lat_max ?? 22);

  const isAntimeridian = west > east;
  const lonSpan = isAntimeridian
    ? (180 - west) + (east + 180)
    : Math.max(east - west, 0.0001);
  const latSpan = Math.max(north - south, 0.0001);

  // Sort slices shallow → deep
  const sorted = [...slicesToRender].sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));
  if (sorted.length === 0) return null;

  // Collect all valid values for global color normalization
  const allValues = [];
  sorted.forEach((s) => {
    (s.points || []).forEach((pt) => {
      const v = valueFor(pt, current.variable);
      if (Number.isFinite(v)) allValues.push(v);
    });
  });
  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 1;
  const valRange = Math.max(maxVal - minVal, 0.0001);
  const anomalyThr = current.anomalyThreshold || 2.0;
  const anomalyMode = current.anomalyMode ?? false;
  const exag = current.verticalExaggeration ?? 35;

  // Collect unique sorted latitudes and normalized longitudes across all slices
  const latSet = new Set();
  const lonSet = new Set();
  sorted.forEach((s) => {
    (s.points || []).forEach((p) => {
      latSet.add(Math.round(Number(p.lat) * 100) / 100);
      const nlon = normalizeLon(p.lon, west, isAntimeridian);
      lonSet.add(Math.round(nlon * 100) / 100);
    });
  });

  const rawLats = [...latSet].sort((a, b) => a - b);
  const rawNormLons = [...lonSet].sort((a, b) => a - b);
  if (rawLats.length === 0 || rawNormLons.length === 0) return null;

  // Adaptive subsampling so rendering stays smooth and interactive
  const latStep = Math.max(1, Math.ceil(rawLats.length / 52));
  const lonStep = Math.max(1, Math.ceil(rawNormLons.length / 64));
  const lats = rawLats.filter((_, idx) => idx % latStep === 0);
  const normLons = rawNormLons.filter((_, idx) => idx % lonStep === 0);
  const nLat = lats.length;
  const nLon = normLons.length;

  // Build fast point lookup maps for each slice: key = `${latKey}_${lonKey}`
  const sliceMaps = sorted.map((s) => {
    const map = new Map();
    (s.points || []).forEach((p) => {
      const lk = Math.round(Number(p.lat) * 100) / 100;
      const nlon = normalizeLon(p.lon, west, isAntimeridian);
      const lok = Math.round(nlon * 100) / 100;
      map.set(`${lk}_${lok}`, p);
    });
    return map;
  });

  function ptToXZ(ptLat, ptNormLon) {
    const nx = ((ptNormLon - west) / lonSpan - 0.5) * modelWidth;
    const nz = ((ptLat - south) / latSpan - 0.5) * modelDepth;
    return [nx, nz];
  }

  function getColor(pt) {
    const v = valueFor(pt, current.variable);
    let c;
    if (anomalyMode) {
      const aVal = pt.anomaly_c ?? (v - (minVal + maxVal) / 2);
      c = anomalyColor(aVal, anomalyThr);
    } else {
      c = colorFor(v, minVal, maxVal, current.variable);
    }
    if (
      current.threshold?.enabled &&
      ((current.threshold.operator === '>' && v > current.threshold.value) ||
        (current.threshold.operator === '<' && v < current.threshold.value) ||
        Math.abs(v - current.threshold.value) <= current.threshold.tolerance)
    ) {
      c.set('#ffeb3b');
    }
    return c;
  }

  const positions = [];
  const colors = [];
  const indices = [];

  // 3D vertex index lookup: grid3D[k][i][j] = vertexIndex
  const nDepths = sorted.length;
  const grid3D = Array.from({ length: nDepths }, () =>
    Array.from({ length: nLat }, () => new Int32Array(nLon).fill(-1))
  );

  let vPtr = 0;

  // 1. Emit all vertices across all depth slices
  for (let k = 0; k < nDepths; k++) {
    const depth_m = sorted[k].depth_m ?? 0;
    const sMap = sliceMaps[k];

    for (let i = 0; i < nLat; i++) {
      const lat = lats[i];
      for (let j = 0; j < nLon; j++) {
        const normLon = normLons[j];
        // Nearest lookup in map
        const pt = sMap.get(`${lat}_${normLon}`);
        if (!pt) continue;

        const v = valueFor(pt, current.variable);
        if (!Number.isFinite(v)) continue;

        const [nx, nz] = ptToXZ(lat, normLon);
        const y = computeElevation(v, minVal, valRange, depth_m, exag);
        const c = getColor(pt);

        positions.push(nx, y, nz);
        colors.push(c.r, c.g, c.b);
        grid3D[k][i][j] = vPtr++;
      }
    }
  }

  if (vPtr === 0) return null;

  // Maximum allowable lat/lon gap to avoid bridging over large continents/missing ocean basins
  const maxLatDelta = (lats[1] - lats[0] || 1) * 2.8;
  const maxLonDelta = (normLons[1] - normLons[0] || 1) * 2.8;

  // 2. Horizontal isodepth surface and depth layer faces
  for (let k = 0; k < nDepths; k++) {
    for (let i = 0; i < nLat - 1; i++) {
      if (Math.abs(lats[i + 1] - lats[i]) > maxLatDelta) continue;
      for (let j = 0; j < nLon - 1; j++) {
        if (Math.abs(normLons[j + 1] - normLons[j]) > maxLonDelta) continue;

        const v00 = grid3D[k][i][j];
        const v01 = grid3D[k][i][j + 1];
        const v10 = grid3D[k][i + 1][j];
        const v11 = grid3D[k][i + 1][j + 1];

        if (v00 >= 0 && v01 >= 0 && v10 >= 0 && v11 >= 0) {
          indices.push(v00, v10, v01);
          indices.push(v01, v10, v11);
        }
      }
    }
  }

  // 3. Connect adjacent depth levels vertically (side curtains & volumetric vertical connections)
  // Connects level k down to level k + 1 wherever adjacent depth samples exist
  if (nDepths > 1) {
    for (let k = 0; k < nDepths - 1; k++) {
      // Latitude-aligned vertical faces (along lon boundaries & transect lines)
      for (let i = 0; i < nLat - 1; i++) {
        if (Math.abs(lats[i + 1] - lats[i]) > maxLatDelta) continue;
        for (let j = 0; j < nLon; j++) {
          const tA = grid3D[k][i][j];
          const tB = grid3D[k][i + 1][j];
          const bA = grid3D[k + 1][i][j];
          const bB = grid3D[k + 1][i + 1][j];

          if (tA >= 0 && tB >= 0 && bA >= 0 && bB >= 0) {
            // Check if boundary edge or transect line (every 3 columns)
            const isBoundary =
              j === 0 ||
              j === nLon - 1 ||
              grid3D[k][i][j - 1] < 0 ||
              grid3D[k][i][j + 1] < 0;
            const isTransect = j % 3 === 0;

            if (isBoundary || isTransect) {
              indices.push(tA, tB, bB);
              indices.push(tA, bB, bA);
            }
          }
        }
      }

      // Longitude-aligned vertical faces (along lat boundaries & transect lines)
      for (let j = 0; j < nLon - 1; j++) {
        if (Math.abs(normLons[j + 1] - normLons[j]) > maxLonDelta) continue;
        for (let i = 0; i < nLat; i++) {
          const tA = grid3D[k][i][j];
          const tB = grid3D[k][i][j + 1];
          const bA = grid3D[k + 1][i][j];
          const bB = grid3D[k + 1][i][j + 1];

          if (tA >= 0 && tB >= 0 && bA >= 0 && bB >= 0) {
            const isBoundary =
              i === 0 ||
              i === nLat - 1 ||
              grid3D[k][i - 1]?.[j] < 0 ||
              grid3D[k][i + 1]?.[j] < 0;
            const isTransect = i % 3 === 0;

            if (isBoundary || isTransect) {
              indices.push(tA, bB, tB);
              indices.push(tA, bA, bB);
            }
          }
        }
      }
    }
  }

  if (indices.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
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
  opacity = 0.90,
  verticalExaggeration = 55,
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

  // ── Main Three.js setup (runs once on mount) ───────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050b16');
    scene.fog = new THREE.FogExp2('#050b16', 0.008);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    camera.position.set(0, 16, 26);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor('#050b16', 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // HUD
    const hud = document.createElement('div');
    hud.style.cssText = [
      'position:absolute', 'top:12px', 'left:14px', 'pointer-events:none',
      'font-family:ui-sans-serif,system-ui,sans-serif', 'color:#e2e8f0',
      'background:rgba(5,11,22,0.88)', 'backdrop-filter:blur(6px)',
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
      'background:rgba(5,11,22,0.80)', 'z-index:30', 'backdrop-filter:blur(3px)',
    ].join(';');
    loadingOverlay.innerHTML = `
      <div style="width:48px;height:48px;border:3px solid #1C3A63;border-top-color:#00f5d4;border-radius:50%;animation:oceanSpin 0.9s linear infinite;"></div>
      <div style="color:#00f5d4;font-size:13px;font-weight:600;letter-spacing:0.5px;">Assembling ocean volume…</div>
      <div id="loading-sub" style="color:#8EA4C8;font-size:11px;max-width:240px;text-align:center;">L1 RAM → L2 Zarr → Backup → Copernicus</div>
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = '@keyframes oceanSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(styleEl);
    mount.appendChild(loadingOverlay);

    // Float marker tooltip
    const tooltip = document.createElement('div');
    tooltip.style.cssText = [
      'position:absolute', 'pointer-events:none', 'background:rgba(6,16,33,0.94)',
      'border:1px solid #00f5d4', 'color:#fff', 'padding:6px 10px',
      'border-radius:6px', 'font-size:11px', 'font-family:monospace', 'z-index:20',
      'display:none', 'transform:translate(-50%,-120%)', 'box-shadow:0 2px 10px rgba(0,245,212,0.3)',
      'white-space:nowrap',
    ].join(';');
    mount.appendChild(tooltip);
    tooltipRef.current = tooltip;

    // Scientific Data Inspector (cursor hover)
    const inspector = document.createElement('div');
    inspector.style.cssText = [
      'position:absolute', 'pointer-events:none', 'background:rgba(6,16,38,0.96)',
      'border:1px solid rgba(0,245,212,0.5)', 'color:#e2e8f0', 'padding:8px 12px',
      'border-radius:6px', 'font-size:10.5px', 'font-family:monospace', 'z-index:25',
      'display:none', 'min-width:170px', 'box-shadow:0 2px 16px rgba(0,0,0,0.5)',
      'line-height:1.6',
    ].join(';');
    mount.appendChild(inspector);

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controls.minDistance = 5;
    controls.maxDistance = 80;
    controls.update();

    // Lighting
    scene.add(new THREE.AmbientLight('#d0e8ff', 1.8));
    const sun = new THREE.DirectionalLight('#fffbe8', 2.0);
    sun.position.set(14, 26, 18);
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#00d4ff', 0.6);
    fill.position.set(-16, -10, -12);
    scene.add(fill);

    const modelWidth  = 18;
    const modelDepth  = 14;

    // Underwater caustic-style point lights at surface corners simulating penetrating sunlight
    const causticLight1 = new THREE.PointLight('#004488', 1.2, 25);
    causticLight1.position.set(modelWidth / 2, depthToY(0), modelDepth / 2);
    scene.add(causticLight1);

    const causticLight2 = new THREE.PointLight('#004488', 1.2, 25);
    causticLight2.position.set(-modelWidth / 2, depthToY(0), -modelDepth / 2);
    scene.add(causticLight2);

    // Floor reference grid at deepest ocean extent
    const floorGrid = new THREE.GridHelper(Math.max(modelWidth, modelDepth) * 1.15, 12, '#002952', '#08172c');
    floorGrid.position.y = depthToY(1000, 55);
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.20;
    scene.add(floorGrid);

    // Depth ruler scale lines
    const RULER_DEPTHS = [0, 50, 100, 200, 500, 1000];
    const rulerGroup = new THREE.Group();
    const rulerMat = new THREE.LineBasicMaterial({ color: '#1e4a80', transparent: true, opacity: 0.5 });
    RULER_DEPTHS.forEach((d) => {
      const y = depthToY(d, 55);
      const rGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(modelWidth / 2 + 0.1, y, 0),
        new THREE.Vector3(modelWidth / 2 + 0.9, y, 0),
      ]);
      rulerGroup.add(new THREE.Line(rGeo, rulerMat));
    });
    scene.add(rulerGroup);

    // Active Depth indicator line on ruler axis (subtle bracket, NOT a giant cutting box plane)
    const activeDepthMat = new THREE.LineBasicMaterial({ color: '#00f5d4', linewidth: 2 });
    const activeDepthGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(modelWidth / 2, 0, 0),
      new THREE.Vector3(modelWidth / 2 + 1.2, 0, 0),
    ]);
    const activeDepthLine = new THREE.Line(activeDepthGeo, activeDepthMat);
    scene.add(activeDepthLine);

    // Active Depth perimeter highlight ring around ocean volume
    const activeDepthRingGeo = new THREE.BufferGeometry();
    const halfW = modelWidth / 2 + 0.15;
    const halfD = modelDepth / 2 + 0.15;
    const ringPts = [
      new THREE.Vector3(-halfW, 0, -halfD),
      new THREE.Vector3(halfW, 0, -halfD),
      new THREE.Vector3(halfW, 0, halfD),
      new THREE.Vector3(-halfW, 0, halfD),
      new THREE.Vector3(-halfW, 0, -halfD),
    ];
    activeDepthRingGeo.setFromPoints(ringPts);
    const activeDepthRingMat = new THREE.LineBasicMaterial({
      color: '#00f5d4',
      transparent: true,
      opacity: 0.75,
    });
    const activeDepthRing = new THREE.Line(activeDepthRingGeo, activeDepthRingMat);
    scene.add(activeDepthRing);

    // Argo float markers
    const floatGeo = new THREE.SphereGeometry(0.32, 14, 14);
    const floatMat = new THREE.MeshStandardMaterial({
      color: '#00f5d4', emissive: '#00e5ff', emissiveIntensity: 1.0, roughness: 0.1,
    });
    const markerMesh = new THREE.InstancedMesh(floatGeo, floatMat, 256);
    markerMesh.count = 0;
    scene.add(markerMesh);

    // Float tether lines (vertical water column penetration)
    const tetherGeo = new THREE.BufferGeometry();
    const tetherPos = new Float32Array(256 * 2 * 3);
    tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPos, 3));
    const tetherMat = new THREE.LineBasicMaterial({ color: '#00f5d4', transparent: true, opacity: 0.35 });
    scene.add(new THREE.LineSegments(tetherGeo, tetherMat));

    // Trajectory group for glider and float paths
    const trajGroup = new THREE.Group();
    scene.add(trajGroup);

    // Current flow vector arrows
    const arrowGeo = new THREE.ConeGeometry(0.12, 0.38, 6);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshStandardMaterial({
      color: '#00f5d4', emissive: '#0077b6', emissiveIntensity: 0.8,
    });
    const vectorMesh = new THREE.InstancedMesh(arrowGeo, arrowMat, 1200);
    vectorMesh.count = 0;
    vectorMesh.visible = false;
    scene.add(vectorMesh);

    // Single continuous ocean volume mesh
    let volumeMesh = null;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredFloat = null;

    // ── UPDATE: Rebuilds continuous volumetric ocean model ───────────────────
    const update = () => {
      const cur = dataRef.current;

      // Loading overlay
      loadingOverlay.style.display = cur.loading === true ? 'flex' : 'none';

      const rawSlices = cur.depthSlices?.length
        ? cur.depthSlices
        : cur.volumeData?.depth_slices || [];

      let slicesToRender = [];
      const baseGrid = cur.grid || [];

      if (rawSlices.length > 0) {
        slicesToRender = rawSlices;
      } else if (baseGrid.length > 0) {
        // Fallback synthetic depth stratification from surface grid
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

      // Dispose previous geometry cleanly
      if (volumeMesh) {
        scene.remove(volumeMesh);
        volumeMesh.geometry.dispose();
        volumeMesh.material.dispose();
        volumeMesh = null;
      }

      if (!slicesToRender.length) {
        if (hudRef.current) {
          hudRef.current.innerHTML = `
            <div style="font-weight:700;color:#38bdf8;">3D OCEAN · ${(cur.regionName || '').toUpperCase()}</div>
            <div style="font-size:11px;color:#94a3b8;">No data loaded — assembling volume…</div>
          `;
        }
        return;
      }

      const sorted = [...slicesToRender].sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));
      const minDepth = sorted[0]?.depth_m ?? 0;
      const maxDepthVal = sorted[sorted.length - 1]?.depth_m ?? 1000;
      const layerCount = sorted.length;

      // Build the single continuous ocean geometry
      const geo = buildOceanGeometry(sorted, {
        ...cur,
        bounds: cur.bounds || { west: 70, east: 85, south: 8, north: 22 },
      }, modelWidth, modelDepth);

      if (geo) {
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          opacity: cur.opacity ?? 0.88,
          roughness: 0.22,
          metalness: 0.08,
          side: THREE.DoubleSide,
        });
        volumeMesh = new THREE.Mesh(geo, mat);
        scene.add(volumeMesh);
      }

      // Active depth indicator position
      const selDepth = Number(cur.depth || 0);
      const exag = cur.verticalExaggeration ?? 35;
      activeDepthLine.position.y = depthToY(selDepth, exag);

      // Bounds resolution for XZ coordinates
      const bnds = cur.bounds || { west: 70, east: 85, south: 8, north: 22 };
      const west  = Number(bnds.west  ?? bnds.lon_min ?? 70);
      const east  = Number(bnds.east  ?? bnds.lon_max ?? 85);
      const south = Number(bnds.south ?? bnds.lat_min ?? 8);
      const north = Number(bnds.north ?? bnds.lat_max ?? 22);
      const isAntimeridian = west > east;
      const lonSpan = isAntimeridian
        ? (180 - west) + (east + 180)
        : Math.max(east - west, 0.0001);
      const latSpan = Math.max(north - south, 0.0001);

      function toScene(lat, lon) {
        const l = normalizeLon(lon, west, isAntimeridian);
        const nx = ((l - west) / lonSpan - 0.5) * modelWidth;
        const nz = ((lat - south) / latSpan - 0.5) * modelDepth;
        return [nx, nz];
      }

      // ── Current vectors ───────────────────────────────────────────────────
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

          const [nx, nz] = toScene(Number(pt.lat), Number(pt.lon));
          const yPos = depthToY(0, exag) + 0.35;
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

      // ── Argo Float & Glider Markers ───────────────────────────────────────
      const floatList = cur.floats || [];
      const floatCount = Math.min(floatList.length, 256);
      markerMesh.count = floatCount;

      while (trajGroup.children.length > 0) {
        const c = trajGroup.children[0];
        c.geometry?.dispose();
        c.material?.dispose();
        trajGroup.remove(c);
      }

      const mtx2 = new THREE.Matrix4();
      const pos2 = new THREE.Vector3();
      const quat2 = new THREE.Quaternion();
      const sc2   = new THREE.Vector3(1.1, 1.1, 1.1);

      floatList.slice(0, floatCount).forEach((fl, idx) => {
        const fLon = Number(fl.lng ?? fl.lon ?? 0);
        const fLat = Number(fl.lat ?? 0);
        const [fx, fz] = toScene(fLat, fLon);
        const flDepth = Number(fl.depth ?? fl.data_depth ?? 10);
        const fy = depthToY(flDepth, exag);

        pos2.set(fx, fy, fz);
        mtx2.compose(pos2, quat2, sc2);
        markerMesh.setMatrixAt(idx, mtx2);

        // Tether from float to ocean surface
        const off = idx * 6;
        tetherPos[off]     = fx; tetherPos[off + 1] = depthToY(0, exag) + 0.1; tetherPos[off + 2] = fz;
        tetherPos[off + 3] = fx; tetherPos[off + 4] = fy;                      tetherPos[off + 5] = fz;

        // Glider / Float real trajectory overlay
        const history = fl.trajectory || fl.history || [];
        if (history.length > 1) {
          const trajPts = history.map((h) => {
            const [hx, hz] = toScene(Number(h.lat ?? fLat), Number(h.lng ?? h.lon ?? fLon));
            const hy = depthToY(Number(h.depth ?? flDepth), exag);
            return new THREE.Vector3(hx, hy, hz);
          });
          const trajGeo = new THREE.BufferGeometry().setFromPoints(trajPts);
          const trajMat = new THREE.LineBasicMaterial({
            color: '#00e5ff', transparent: true, opacity: 0.55,
          });
          trajGroup.add(new THREE.Line(trajGeo, trajMat));
        }
      });
      markerMesh.instanceMatrix.needsUpdate = true;
      tetherGeo.attributes.position.needsUpdate = true;

      // ── HUD Status ────────────────────────────────────────────────────────
      if (hudRef.current) {
        const srcLabel = cur.dataSource === 'copernicus_zarr'
          ? '🟢 Copernicus Live (L2)'
          : cur.dataSource === 'backup_cache'
          ? `📦 Copernicus Backup (${cur.backupDate || 'Stored'})`
          : cur.dataSource === 'analytical_demo'
          ? '🌐 Analytical Ocean Field'
          : '🌐 Cached Ocean Volume';

        const anomalyBadge = cur.anomalyMode
          ? '<span style="background:#f97316;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px;">ANOMALY</span>'
          : '';

        hudRef.current.innerHTML = `
          <div style="font-weight:700;color:#38bdf8;letter-spacing:0.5px;">
            3D OCEAN · ${(cur.regionName || '').toUpperCase()}${anomalyBadge}
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

    // ── Mouse Pointer Move (Float Picker + Scientific Hover Inspector) ────────
    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      // Check float hit first
      const floatHit = raycaster.intersectObject(markerMesh)[0];
      if (floatHit && dataRef.current.floats[floatHit.instanceId]) {
        const fl = dataRef.current.floats[floatHit.instanceId];
        hoveredFloat = fl;
        renderer.domElement.style.cursor = 'pointer';
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'block';
          tooltipRef.current.style.left = `${e.clientX - rect.left}px`;
          tooltipRef.current.style.top  = `${e.clientY - rect.top}px`;
          const wmo  = fl.platform_number || fl.id || 'Argo';
          const temp = fl.temperature != null ? `${Number(fl.temperature).toFixed(2)}°C` : 'No data';
          const sal  = fl.salinity    != null ? `${Number(fl.salinity).toFixed(2)} PSU` : 'No data';
          const d    = fl.depth       != null ? `${Math.round(fl.depth)}m` : '0m';
          tooltipRef.current.innerHTML = `
            <strong>Float #${wmo}</strong><br/>
            Lat: ${Number(fl.lat ?? 0).toFixed(3)}° Lon: ${Number(fl.lng ?? fl.lon ?? 0).toFixed(3)}°<br/>
            Depth: ${d}<br/>
            Temp: ${temp} | Sal: ${sal}<br/>
            <span style="color:#38bdf8;font-size:10px;">Click for profile</span>
          `;
        }
        inspector.style.display = 'none';
        return;
      }

      hoveredFloat = null;
      renderer.domElement.style.cursor = 'default';
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';

      // Scientific cursor inspector over 3D ocean volume
      if (volumeMesh) {
        const volHit = raycaster.intersectObject(volumeMesh)[0];
        if (volHit) {
          const hp = volHit.point;
          const cur = dataRef.current;
          const bnds = cur.bounds || { west: 70, east: 85, south: 8, north: 22 };
          const bWest  = Number(bnds.west  ?? 70);
          const bEast  = Number(bnds.east  ?? 85);
          const bSouth = Number(bnds.south ?? 8);
          const bNorth = Number(bnds.north ?? 22);
          const isAM = bWest > bEast;
          const lSpan = isAM ? (180 - bWest) + (bEast + 180) : Math.max(bEast - bWest, 0.0001);
          const laSpan = Math.max(bNorth - bSouth, 0.0001);

          let hitLon = bWest + ((hp.x / modelWidth + 0.5) * lSpan);
          if (hitLon > 180) hitLon -= 360;
          const hitLat = bSouth + ((hp.z / modelDepth + 0.5) * laSpan);

          // Estimate physical depth from Y
          const curExag = cur.verticalExaggeration ?? 35;
          const scale = curExag / 35;
          const normY = Math.max(0, Math.min(1, (4.2 * scale - hp.y) / (8.4 * scale)));
          const hitDepth = Math.round(Math.pow(normY, 1 / 0.45) * 1000);

          // Nearest value from current depth slices
          const sortedSlices = [...(cur.depthSlices?.length ? cur.depthSlices : cur.volumeData?.depth_slices || [])]
            .sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));
          const nearestSlice = sortedSlices.reduce((best, s) =>
            Math.abs((s.depth_m ?? 0) - hitDepth) < Math.abs((best.depth_m ?? 0) - hitDepth) ? s : best,
            sortedSlices[0]
          );

          let hitVal = null;
          if (nearestSlice?.points?.length) {
            let minD = Infinity;
            nearestSlice.points.forEach((p) => {
              const d2 = Math.hypot(p.lat - hitLat, p.lon - hitLon);
              if (d2 < minD) {
                minD = d2;
                hitVal = valueFor(p, cur.variable);
              }
            });
          }

          const valDisplay = Number.isFinite(hitVal) ? hitVal.toFixed(3) : 'No data';
          const units = {
            temperature: '°C', salinity: 'PSU', currents: 'm/s',
            chlorophyll: 'mg/m³', oxygen: 'mmol/m³', ph: '',
            nitrate: 'mmol/m³', pco2: 'µatm',
          }[cur.variable] || '';

          inspector.style.display = 'block';
          inspector.style.left = `${e.clientX - rect.left + 14}px`;
          inspector.style.top  = `${e.clientY - rect.top - 10}px`;
          inspector.innerHTML = `
            <div style="color:#00f5d4;font-weight:700;margin-bottom:3px;">🔬 Ocean Inspector</div>
            <div>Lat: <strong>${hitLat.toFixed(2)}°</strong> | Lon: <strong>${hitLon.toFixed(2)}°</strong></div>
            <div>Depth: <strong>~${hitDepth}m</strong> (${nearestSlice?.depth_m ?? 0}m slice)</div>
            <div>${cur.variable}: <strong style="color:#38bdf8;">${valDisplay} ${units}</strong></div>
            <div style="color:#8ea4c8;font-size:9.5px;margin-top:2px;">Source: ${cur.dataSource || 'cache'}</div>
            <div style="color:#8ea4c8;font-size:9.5px;">Date: ${cur.backupDate || 'Latest available'}</div>
          `;
        } else {
          inspector.style.display = 'none';
        }
      } else {
        inspector.style.display = 'none';
      }
    };

    const onClick = () => { if (hoveredFloat) onSelectMarker?.(hoveredFloat); };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    // Animation render loop
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
      activeDepthGeo.dispose(); activeDepthMat.dispose();
      floatGeo.dispose(); floatMat.dispose();
      arrowGeo.dispose(); arrowMat.dispose();
      tetherGeo.dispose(); tetherMat.dispose();
      rulerMat.dispose();
      renderer.dispose();
      styleEl.remove();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(hud))             mount.removeChild(hud);
      if (mount.contains(tooltip))         mount.removeChild(tooltip);
      if (mount.contains(inspector))       mount.removeChild(inspector);
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
