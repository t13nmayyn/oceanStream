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

// All 50 standard Copernicus NEMO depth levels (0.494 m → 5727.917 m)
export const COPERNICUS_DEPTHS = [
  0.494025, 1.541375, 2.645669, 3.819495, 5.078224,
  6.440614, 7.92956, 9.572997, 11.405, 13.467141,
  15.810017, 18.495560, 21.598820, 25.211393, 29.444731,
  34.434326, 40.344238, 47.373692, 55.764290, 65.807495,
  77.853851, 92.326073, 109.729034, 130.666016, 155.850723,
  186.125488, 222.475241, 266.040344, 318.127411, 380.213013,
  453.937744, 541.088867, 643.566772, 763.333191, 902.339233,
  1062.43896, 1245.29102, 1452.25098, 1684.28406, 1941.89342,
  2225.07764, 2533.33618, 2865.70264, 3220.81958, 3597.03223,
  3992.48438, 4405.22461, 4833.29004, 5274.78418, 5727.91699,
];

// Maximum depth of the Copernicus dataset
export const COPERNICUS_MAX_DEPTH = 5727.917;

// Physical depth → 3D scene Y position.
// Ocean surface is at top (~+4.2), deepest ocean (5728m) is at bottom (~-4.2).
// Power scaling (0.42) preserves vertical resolution in the upper thermocline.
// maxDepth: actual maximum depth to normalize against (defaults to full Copernicus range).
export function depthToY(depth_m, verticalExag = 35, maxDepth = COPERNICUS_MAX_DEPTH) {
  const safeMax = Math.max(maxDepth, 100);
  const clamped = Math.min(Math.max(0, depth_m), safeMax);
  const norm = Math.pow(clamped / safeMax, 0.42);
  const scale = verticalExag / 35;
  return (4.2 - norm * 8.4) * scale;
}


// Subtle surface elevation and subsurface thermocline relief
export function computeElevation(value, min_val, val_range, depth_m, verticalExag = 55, maxDepth = COPERNICUS_MAX_DEPTH) {
  const baseY = depthToY(depth_m, verticalExag, maxDepth);
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

// Physical bathymetry terrain relief for 3D seafloor:
// Incorporates underwater mountains, ridges (Mid-Atlantic, Central Indian, East Pacific, Gakkel),
// trenches (Mariana, Java/Sunda, Puerto Rico, South Sandwich), continental slopes, and basins.
export function computeBathymetryRelief(lat, lon, verticalExag = 35) {
  const l = Number(lon);
  const la = Number(lat);

  // 1. Mid-Ocean Ridges (divergent plate boundaries, underwater mountains)
  let ridgeRelief = 0;
  // Mid-Atlantic Ridge (lon -48 to -20, lat -55 to 65)
  if (l >= -48 && l <= -20 && la >= -55 && la <= 65) {
    const spine = -35 + Math.sin(la * 0.09) * 7.0;
    const dist = Math.abs(l - spine);
    if (dist < 10.0) {
      ridgeRelief += (1.0 - dist / 10.0) * 2.2;
    }
  }
  // Central Indian & Southeast/Southwest Indian Ridges (lon 58 to 95, lat -45 to 15)
  if (l >= 58 && l <= 95 && la >= -45 && la <= 15) {
    const cirSpine = 68 + Math.sin(la * 0.12) * 6.0;
    const nerSpine = 90; // Ninety East Ridge
    const dCIR = Math.abs(l - cirSpine);
    const dNER = Math.abs(l - nerSpine);
    const ridgeD = Math.min(dCIR, dNER);
    if (ridgeD < 9.0) {
      ridgeRelief += (1.0 - ridgeD / 9.0) * 1.9;
    }
  }
  // East Pacific Rise & Pacific-Antarctic Ridge
  if (l >= -140 && l <= -90 && la >= -60 && la <= 25) {
    const eprSpine = -112 + Math.sin(la * 0.08) * 9.0;
    const dEPR = Math.abs(l - eprSpine);
    if (dEPR < 14.0) {
      ridgeRelief += (1.0 - dEPR / 14.0) * 1.8;
    }
  }
  // Arctic Gakkel Ridge
  if (la >= 72) {
    const gakkelDist = Math.abs(l - 30);
    if (gakkelDist < 25.0) {
      ridgeRelief += (1.0 - gakkelDist / 25.0) * 1.4;
    }
  }

  // 2. Deep Ocean Trenches (subduction zones)
  let trenchRelief = 0;
  // Mariana Trench (Pacific ~11N, 142E)
  const dMariana = Math.hypot(la - 11.3, l - 142.2);
  if (dMariana < 12.0) {
    trenchRelief -= (1.0 - dMariana / 12.0) * 2.8;
  }
  // Java / Sunda Trench (Indian Ocean ~ -10S, 105E)
  const dJava = Math.hypot(la - (-10.2), l - 105.0);
  if (dJava < 14.0) {
    trenchRelief -= (1.0 - dJava / 14.0) * 2.4;
  }
  // Puerto Rico Trench (Atlantic ~ 19.5N, -66W)
  const dPR = Math.hypot(la - 19.5, l - (-66.0));
  if (dPR < 10.0) {
    trenchRelief -= (1.0 - dPR / 10.0) * 2.1;
  }
  // South Sandwich Trench (Southern Ocean ~ -55S, -26W)
  const dSS = Math.hypot(la - (-55.0), l - (-26.0));
  if (dSS < 10.0) {
    trenchRelief -= (1.0 - dSS / 10.0) * 2.0;
  }

  // 3. Multi-scale harmonic abyssal hills, slopes, basins
  const abyssalTerrain =
    0.42 * Math.sin(la * 0.42 + l * 0.31) +
    0.28 * Math.cos(la * 0.85 - l * 0.58) +
    0.16 * Math.sin(la * 1.65 + l * 1.35) +
    0.08 * Math.cos(la * 3.1 - l * 2.7);

  const scale = verticalExag / 35;
  return (ridgeRelief + trenchRelief + abyssalTerrain * 0.7) * 0.45 * scale;
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

// For each lat/lon cell, find its real seafloor depth
export function getSeafloorDepth(lat, lon, bathyGrid, bathyLats, bathyLons) {
  if (!bathyGrid || !bathyLats || !bathyLons || !bathyLats.length || !bathyLons.length) return 1000;
  let li = 0;
  let minLatDiff = Infinity;
  for (let i = 0; i < bathyLats.length; i++) {
    const diff = Math.abs(bathyLats[i] - lat);
    if (diff < minLatDiff) { minLatDiff = diff; li = i; }
  }
  let lj = 0;
  let minLonDiff = Infinity;
  for (let j = 0; j < bathyLons.length; j++) {
    const diff = Math.abs(bathyLons[j] - lon);
    if (diff < minLonDiff) { minLonDiff = diff; lj = j; }
  }
  const d = bathyGrid[li]?.[lj];
  return Number.isFinite(d) ? d : null; // null = land, skip entirely
}

// ─────────────────────────────────────────────────────────────────────────────
// buildOceanGeometry:
//   Constructs a single continuous volumetric ocean field with real seafloor
//   bathymetry masking (continental shelves, slopes, and deep ocean trenches).
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

  // Sort slices shallow -> deep, drop empty layers
  let sorted = [...slicesToRender]
    .filter((s) => (s.points || []).length > 0)
    .sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));
  if (sorted.length === 0) return null;

  // ── Layer decimation: cap at ~18 rendered layers for smooth frame rates ──
  const MAX_RENDER_LAYERS = 18;
  if (sorted.length > MAX_RENDER_LAYERS) {
    const shallow = sorted.filter((s) => (s.depth_m ?? 0) <= 200);
    const deep = sorted.filter((s) => (s.depth_m ?? 0) > 200);
    const deepBudget = Math.max(4, MAX_RENDER_LAYERS - shallow.length);
    const deepStep = Math.max(1, Math.ceil(deep.length / deepBudget));
    const sampledDeep = deep.filter((_, idx) => idx % deepStep === 0);
    // Always include the deepest layer with data
    if (sampledDeep.length > 0 && deep.length > 0 && sampledDeep[sampledDeep.length - 1] !== deep[deep.length - 1]) {
      sampledDeep.push(deep[deep.length - 1]);
    }
    sorted = [...shallow, ...sampledDeep];
  }

  // ── Loop-based min/max ──
  let minVal = Infinity;
  let maxVal = -Infinity;
  let valueCount = 0;
  for (let si = 0; si < sorted.length; si++) {
    const pts = sorted[si].points || [];
    for (let pi = 0; pi < pts.length; pi++) {
      const v = valueFor(pts[pi], current.variable);
      if (Number.isFinite(v)) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
        valueCount++;
      }
    }
  }
  if (valueCount === 0) { minVal = 0; maxVal = 1; }
  const valRange = Math.max(maxVal - minVal, 0.0001);
  const anomalyThr = current.anomalyThreshold || 2.0;
  const anomalyMode = current.anomalyMode ?? false;
  const exag = current.verticalExaggeration ?? 35;

  // Determine the actual maximum depth from this dataset
  const providedMaxDepth = current.depthRange?.max;
  let sliceMaxDepth = 0;
  for (let si = 0; si < sorted.length; si++) {
    const d = sorted[si].depth_m ?? 0;
    if (d > sliceMaxDepth) sliceMaxDepth = d;
  }
  const maxDepth = Math.max(providedMaxDepth ?? sliceMaxDepth, sliceMaxDepth, 100);

  const bathyGrid = current.bathyGrid || current.volumeData?.bathymetry;
  const bathyLats = current.bathyLats || current.volumeData?.bathymetry_lats;
  const bathyLons = current.bathyLons || current.volumeData?.bathymetry_lons;

  console.log('[OceanSlab buildOceanGeometry DIAGNOSTIC]', {
    currentBathyGridIsArray: Array.isArray(current.bathyGrid),
    currentBathyGridLength: current.bathyGrid?.length,
    volumeDataBathymetryLength: current.volumeData?.bathymetry?.length,
    effectiveBathyGridLength: bathyGrid?.length,
    sampleDepth1: getSeafloorDepth(10, 70, bathyGrid, bathyLats, bathyLons),
    sampleDepth2: getSeafloorDepth(15, 75, bathyGrid, bathyLats, bathyLons),
    sampleDepth3: getSeafloorDepth(20, 80, bathyGrid, bathyLats, bathyLons),
    sampleDepth4: getSeafloorDepth(12, 85, bathyGrid, bathyLats, bathyLons),
  });

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

  // ── Spatial grid decimation for ultra-fluid rendering ──
  const latStep = Math.max(1, Math.ceil(rawLats.length / 28));
  const lonStep = Math.max(1, Math.ceil(rawNormLons.length / 36));
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

  // Precompute seafloor depths and XZ coordinates once for the 2D horizontal grid
  const seafloorGrid = Array.from({ length: nLat }, () => new Float32Array(nLon));
  const isLandGrid = Array.from({ length: nLat }, () => new Uint8Array(nLon));
  const xzGrid = Array.from({ length: nLat }, () => Array.from({ length: nLon }, () => [0, 0]));

  for (let i = 0; i < nLat; i++) {
    const lat = lats[i];
    for (let j = 0; j < nLon; j++) {
      const normLon = normLons[j];
      const origLon = (isAntimeridian && normLon > 180) ? normLon - 360 : normLon;
      const sf = getSeafloorDepth(lat, origLon, bathyGrid, bathyLats, bathyLons);
      if (sf === null) {
        isLandGrid[i][j] = 1;
      } else {
        seafloorGrid[i][j] = sf;
        xzGrid[i][j] = ptToXZ(lat, normLon);
      }
    }
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

  // 1. Emit all vertices across all depth slices masked by real bathymetry
  for (let i = 0; i < nLat; i++) {
    const lat = lats[i];
    for (let j = 0; j < nLon; j++) {
      if (isLandGrid[i][j]) continue; // land — skip entirely

      const normLon = normLons[j];
      const seafloor = seafloorGrid[i][j];
      const [nx, nz] = xzGrid[i][j];

      for (let k = 0; k < nDepths; k++) {
        const depth_m = sorted[k].depth_m ?? 0;
        if (depth_m > seafloor) continue; // below seafloor for this cell — skip

        const sMap = sliceMaps[k];
        const pt = sMap.get(`${lat}_${normLon}`);
        if (!pt) continue;

        const v = valueFor(pt, current.variable);
        if (!Number.isFinite(v)) continue;

        const y = computeElevation(v, minVal, valRange, depth_m, exag, maxDepth);
        const c = getColor(pt).clone();

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

  // 3. Connect adjacent depth levels vertically — forming a continuous 3D ocean volume
  if (nDepths > 1) {
    for (let k = 0; k < nDepths - 1; k++) {
      // Latitude-aligned vertical faces
      for (let i = 0; i < nLat - 1; i++) {
        if (Math.abs(lats[i + 1] - lats[i]) > maxLatDelta) continue;
        for (let j = 0; j < nLon; j++) {
          const tA = grid3D[k][i][j];
          const tB = grid3D[k][i + 1][j];
          const bA = grid3D[k + 1][i][j];
          const bB = grid3D[k + 1][i + 1][j];
          if (tA < 0 || tB < 0 || bA < 0 || bB < 0) continue;

          const isEdge = (j === 0 || j === nLon - 1 || grid3D[k][i][j - 1] < 0 || grid3D[k][i][j + 1] < 0);
          const isInternalWeave = (j % 2 === 0);
          if (isEdge || isInternalWeave) {
            indices.push(tA, tB, bB);
            indices.push(tA, bB, bA);
          }
        }
      }

      // Longitude-aligned vertical faces
      for (let j = 0; j < nLon - 1; j++) {
        if (Math.abs(normLons[j + 1] - normLons[j]) > maxLonDelta) continue;
        for (let i = 0; i < nLat; i++) {
          const tA = grid3D[k][i][j];
          const tB = grid3D[k][i][j + 1];
          const bA = grid3D[k + 1][i][j];
          const bB = grid3D[k + 1][i][j + 1];
          if (tA < 0 || tB < 0 || bA < 0 || bB < 0) continue;

          const isEdge = (i === 0 || i === nLat - 1 || grid3D[k][i - 1]?.[j] < 0 || grid3D[k][i + 1]?.[j] < 0);
          const isInternalWeave = (i % 2 === 0);
          if (isEdge || isInternalWeave) {
            indices.push(tA, bB, tB);
            indices.push(tA, bA, bB);
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
  bathyGrid = null,
  bathyLats = null,
  bathyLons = null,
  grid = [],
  floats = [],
  showArgo = true,
  showGliders = true,
  visualizationMode = 'subset',
  maxDepth = null,
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
  loadingPhase = null,
  onSelectMarker,
}) {
  const mountRef   = useRef(null);
  const sceneRef   = useRef(null);
  const hudRef     = useRef(null);
  const tooltipRef = useRef(null);

  const dataRef = useRef({
    depthSlices, volumeData, bathyGrid, bathyLats, bathyLons, grid, floats, showArgo, showGliders, visualizationMode, maxDepth,
    variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold,
    source, dataSource, backupDate, regionName, anomalyMode, anomalyThreshold, loading, loadingPhase,
  });

  useEffect(() => {
    dataRef.current = {
      depthSlices, volumeData, bathyGrid, bathyLats, bathyLons, grid, floats, showArgo, showGliders, visualizationMode, maxDepth,
      variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold,
      source, dataSource, backupDate, regionName, anomalyMode, anomalyThreshold, loading, loadingPhase,
    };
  }, [
    depthSlices, volumeData, bathyGrid, bathyLats, bathyLons, grid, floats, showArgo, showGliders, visualizationMode, maxDepth,
    variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold,
    source, dataSource, backupDate, regionName, anomalyMode, anomalyThreshold, loading, loadingPhase,
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
    camera.position.set(0, 8, 22);
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

    // Loading overlay — non-blocking floating status indicator
    const loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = [
      'position:absolute', 'top:14px', 'right:14px', 'display:none', 'align-items:center',
      'gap:10px', 'background:rgba(6,16,33,0.92)', 'z-index:30', 'backdrop-filter:blur(8px)',
      'padding:8px 16px', 'border-radius:20px', 'border:1px solid rgba(0,245,212,0.4)',
      'box-shadow:0 4px 20px rgba(0,0,0,0.6)', 'pointer-events:none', 'transition:all 0.3s ease',
    ].join(';');
    loadingOverlay.innerHTML = `
      <div style="width:16px;height:16px;border:2px solid #1C3A63;border-top-color:#00f5d4;border-radius:50%;animation:oceanSpin 0.8s linear infinite;flex-shrink:0;"></div>
      <div style="display:flex;flex-direction:column;gap:1px;">
        <div id="loading-main" style="color:#00f5d4;font-size:11.5px;font-weight:600;letter-spacing:0.3px;white-space:nowrap;">Loading ocean data…</div>
        <div id="loading-sub" style="color:#8EA4C8;font-size:9.5px;white-space:nowrap;">L1 RAM → L2 Zarr → Copernicus</div>
      </div>
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
    controls.minDistance = 0.5;
    controls.maxDistance = 120;
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

    // Active Depth indicator — a small bracket tick on the ruler axis only.
    // (The previous full rectangular perimeter ring around the whole model
    // footprint has been removed: it was a literal cage-wireframe box drawn
    // around the entire domain and was one of the main contributors to the
    // "fish tank" look. A short tick is enough to show which depth is active
    // without implying a rectangular hull around the data.)
    const activeDepthMat = new THREE.LineBasicMaterial({ color: '#00f5d4', linewidth: 2 });
    const activeDepthGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(modelWidth / 2, 0, 0),
      new THREE.Vector3(modelWidth / 2 + 1.2, 0, 0),
    ]);
    const activeDepthLine = new THREE.Line(activeDepthGeo, activeDepthMat);
    scene.add(activeDepthLine);

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

    // Single continuous ocean volume mesh and managed bathymetric floor
    let volumeMesh = null;
    let bathyMesh = null;

    let targetCameraY = null;
    let targetControlsY = null;
    let lastAnimatedDepth = null;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredFloat = null;

    // ── UPDATE: Rebuilds continuous volumetric ocean model ───────────────────
    const update = () => {
      const cur = dataRef.current;

      // Dynamic non-blocking loading state pill
      const loadingMain = loadingOverlay.querySelector('#loading-main');
      const loadingSub  = loadingOverlay.querySelector('#loading-sub');
      const isLoading = cur.loading === true || cur.loadingPhase === 'fetching' || cur.loadingPhase === 'processing';

      if (isLoading) {
        loadingOverlay.style.display = 'flex';
        const phase = cur.loadingPhase;
        const reg = cur.regionName || 'ocean';

        if (phase === 'cache_hit') {
          if (loadingMain) loadingMain.textContent = '⚡ Loading cached data…';
          if (loadingSub)  loadingSub.textContent  = 'Serving from L1/L2 spatial cache';
        } else if (phase === 'fetching') {
          if (loadingMain) loadingMain.textContent = `🌐 Fetching ${reg} data…`;
          if (loadingSub)  loadingSub.textContent  = 'Requesting Copernicus marine origin';
        } else if (phase === 'processing') {
          if (loadingMain) loadingMain.textContent = '⚙️ Preparing 3D volume…';
          if (loadingSub)  loadingSub.textContent  = 'Interpolating depth stratification…';
        } else if (phase === 'error') {
          if (loadingMain) loadingMain.textContent = '⚠️ Unable to fetch region';
          if (loadingSub)  loadingSub.textContent  = 'Showing cached data if available';
        } else {
          if (loadingMain) loadingMain.textContent = `Loading ${reg} data…`;
          if (loadingSub)  loadingSub.textContent  = 'L1 RAM → L2 Zarr → Copernicus';
        }
      } else {
        loadingOverlay.style.display = 'none';
      }

      const rawSlices = cur.depthSlices?.length
        ? cur.depthSlices
        : cur.volumeData?.depth_slices || [];

      let slicesToRender = rawSlices.length > 0 ? rawSlices : [];

      // Preserve previously rendered scene while new data is loading
      if (!slicesToRender.length) {
        if (!volumeMesh && hudRef.current) {
          hudRef.current.innerHTML = `
            <div style="font-weight:700;color:#38bdf8;">3D OCEAN · ${(cur.regionName || '').toUpperCase()}</div>
            <div style="font-size:11px;color:#94a3b8;">Loading ocean volume…</div>
          `;
        }
        return;
      }

      const sorted = [...slicesToRender].sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));
      const minDepth = sorted[0]?.depth_m ?? 0;
      const maxDepthVal = sorted[sorted.length - 1]?.depth_m ?? 1000;
      const layerCount = sorted.length;
      const effectiveMaxDepth = Math.max(cur.maxDepth ?? 0, maxDepthVal, 100);

      // Dynamically update depth ruler scale lines to match available depth
      const exag = cur.verticalExaggeration ?? 35;
      while (rulerGroup.children.length > 0) {
        const c = rulerGroup.children[0];
        c.geometry?.dispose();
        rulerGroup.remove(c);
      }
      const RULER_CANDIDATES = [0, 10, 50, 100, 200, 500, 1000, 2000, 3000, 4000, 5000, 5728];
      const activeRulerDepths = RULER_CANDIDATES.filter((d) => d <= effectiveMaxDepth * 1.05);
      activeRulerDepths.forEach((d) => {
        const y = depthToY(d, exag, effectiveMaxDepth);
        const rGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(modelWidth / 2 + 0.1, y, 0),
          new THREE.Vector3(modelWidth / 2 + 0.9, y, 0),
        ]);
        rulerGroup.add(new THREE.Line(rGeo, rulerMat));
      });

      // Build the single continuous ocean geometry
      const geo = buildOceanGeometry(sorted, {
        ...cur,
        depthRange: { min: minDepth, max: effectiveMaxDepth },
        bounds: cur.bounds || { west: 70, east: 85, south: 8, north: 22 },
      }, modelWidth, modelDepth);

      if (geo) {
        if (volumeMesh) {
          scene.remove(volumeMesh);
          volumeMesh.geometry.dispose();
          volumeMesh.material.dispose();
          volumeMesh = null;
        }
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          opacity: cur.opacity ?? 0.88,
          roughness: 0.28,
          metalness: 0.08,
          side: THREE.DoubleSide,
        });
        volumeMesh = new THREE.Mesh(geo, mat);
        scene.add(volumeMesh);
      }

      if (bathyMesh) {
        scene.remove(bathyMesh);
        bathyMesh.geometry.dispose();
        bathyMesh.material.dispose();
        bathyMesh = null;
      }

      // Bathymetry floor — uses effectiveMaxDepth so full-depth mode shows correct basin shape
      const bathyGeo = new THREE.PlaneGeometry(modelWidth, modelDepth, 40, 40);
      bathyGeo.rotateX(-Math.PI / 2);
      const bathyPositions = bathyGeo.attributes.position;
      for (let i = 0; i < bathyPositions.count; i++) {
        const x = bathyPositions.getX(i);
        const z = bathyPositions.getZ(i);
        const radialDist = Math.sqrt((x / modelWidth) ** 2 + (z / modelDepth) ** 2);
        // Scale bowl depth to actual dataset depth so it doesn't clip at 1000 m
        const basinFraction = 0.85 + radialDist * 0.15;
        const bowlDepth = effectiveMaxDepth * basinFraction;
        const ridge = Math.sin(x * 0.8) * Math.cos(z * 0.6) * effectiveMaxDepth * 0.04;
        const seamount = Math.exp(-((x + 2) ** 2 + (z - 1) ** 2) / 3) * effectiveMaxDepth * 0.1;
        const finalDepth = Math.min(bowlDepth - ridge - seamount, effectiveMaxDepth);
        bathyPositions.setY(i, depthToY(finalDepth, exag, effectiveMaxDepth));
      }
      bathyGeo.computeVertexNormals();
      const bathyMat = new THREE.MeshStandardMaterial({
        color: '#0a2240',
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
      bathyMesh = new THREE.Mesh(bathyGeo, bathyMat);
      scene.add(bathyMesh);

      // Active depth indicator position
      const selDepth = Number(cur.depth || 0);
      const activeY = depthToY(selDepth, exag, effectiveMaxDepth);
      activeDepthLine.position.y = activeY;

      if (lastAnimatedDepth !== selDepth) {
        lastAnimatedDepth = selDepth;
        targetCameraY = activeY + 3.2;
        targetControlsY = activeY;
      }

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
          const yPos = depthToY(0, exag, effectiveMaxDepth) + 0.35;
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

      // ── Argo Float & Glider Markers (with toggles) ────────────────────────
      const rawFloats = cur.floats || [];
      const floatList = rawFloats.filter((fl) => {
        const t = (fl.type || fl.float_type || '').toLowerCase();
        const isGlider = t.includes('glider') || (fl.name && fl.name.toLowerCase().includes('glider'));
        if (isGlider) return cur.showGliders !== false;
        return cur.showArgo !== false;
      });

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
        const fy = depthToY(flDepth, exag, effectiveMaxDepth);

        pos2.set(fx, fy, fz);
        mtx2.compose(pos2, quat2, sc2);
        markerMesh.setMatrixAt(idx, mtx2);

        // Tether from float to ocean surface
        const off = idx * 6;
        tetherPos[off]     = fx; tetherPos[off + 1] = depthToY(0, exag, effectiveMaxDepth) + 0.1; tetherPos[off + 2] = fz;
        tetherPos[off + 3] = fx; tetherPos[off + 4] = fy;                                          tetherPos[off + 5] = fz;

        // Glider / Float real trajectory overlay
        const history = fl.trajectory || fl.history || [];
        if (history.length > 1) {
          const trajPts = history.map((h) => {
            const [hx, hz] = toScene(Number(h.lat ?? fLat), Number(h.lng ?? h.lon ?? fLon));
            const hy = depthToY(Number(h.depth ?? flDepth), exag, effectiveMaxDepth);
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

        const modeBadge = cur.visualizationMode === 'full'
          ? '<span style="background:#0284c7;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-left:8px;letter-spacing:0.3px;">FULL OCEAN MODE</span>'
          : '<span style="background:rgba(28,58,99,0.85);color:#38bdf8;border:1px solid rgba(56,189,248,0.4);padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-left:8px;letter-spacing:0.3px;">SUBSET MODE — QUICK RENDER</span>';

        hudRef.current.innerHTML = `
          <div style="font-weight:700;color:#38bdf8;letter-spacing:0.5px;display:flex;align-items:center;">
            3D OCEAN · ${(cur.regionName || '').toUpperCase()}${modeBadge}${anomalyBadge}
          </div>
          <div style="display:flex;gap:10px;font-size:11px;color:#94a3b8;margin-top:2px;">
            <span>Depth: <strong style="color:#00f5d4;">${selDepth}m</strong></span>
            <span>Layers: <strong style="color:#fff;">${layerCount} (${minDepth < 1 ? minDepth.toFixed(3) : Math.round(minDepth)}–${maxDepthVal > 1000 ? maxDepthVal.toFixed(1) : Math.round(maxDepthVal)}m)</strong></span>
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
          const curMaxDepth = Math.max(cur.maxDepth ?? 0, 1000);
          const hitDepth = Math.round(Math.pow(normY, 1 / 0.42) * curMaxDepth);

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
      // Smooth 60-frame lerp when flying to clicked depth
      if (targetCameraY !== null) {
        const dy = targetCameraY - camera.position.y;
        if (Math.abs(dy) > 0.02) {
          camera.position.y += dy * 0.08;
          controls.target.y += (targetControlsY - controls.target.y) * 0.08;
        } else {
          targetCameraY = null;
        }
      }
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
      if (bathyMesh) { bathyMesh.geometry.dispose(); bathyMesh.material.dispose(); }
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
    depthSlices, volumeData, grid, floats, showArgo, showGliders, visualizationMode, maxDepth,
    variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold,
    source, dataSource, backupDate, regionName, anomalyMode, anomalyThreshold, loading,
  ]);

  return (
    <div
      ref={mountRef}
      className="ocean-slab-canvas w-full h-full relative overflow-hidden"
      aria-label="3D Ocean Volume — continuous depth field"
    />
  );
}