import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEPTH_BINS = [0, 10, 50, 100, 200, 500, 1000];

// ── Scientific colour ramps ────────────────────────────────────────────────
const STOPS = {
  // Scientific Thermal (cmocean thermal): deep abyss navy -> cyan -> teal -> emerald -> solar amber -> coral red -> crimson
  temperature:  ['#03071e', '#004e89', '#00a896', '#02c39a', '#a7c957', '#ffd166', '#f77f00', '#d62828', '#9d0208'],
  thetao:       ['#03071e', '#004e89', '#00a896', '#02c39a', '#a7c957', '#ffd166', '#f77f00', '#d62828', '#9d0208'],

  // Scientific Haline (cmocean haline): low salinity indigo -> ocean cyan -> teal -> mint -> amber gold -> hyper-saline violet
  salinity:     ['#0b132b', '#1c2541', '#0077b6', '#00b4d8', '#2a9d8f', '#80ed99', '#f4a261', '#e76f51', '#7209b7'],
  so:           ['#0b132b', '#1c2541', '#0077b6', '#00b4d8', '#2a9d8f', '#80ed99', '#f4a261', '#e76f51', '#7209b7'],

  currents:     ['#03071e', '#023e8a', '#0077b6', '#00b4d8', '#00f5d4', '#70e000', '#ffff3f'],
  chlorophyll:  ['#03071e', '#081c15', '#1b4332', '#2d6a4f', '#52b788', '#95d5b2', '#d8f3dc'],
  oxygen:       ['#240046', '#3a0ca3', '#4361ee', '#4cc9f0', '#70e000', '#ffaa00', '#ff0054'],
  ph:           ['#d00000', '#e85d04', '#ffba08', '#52b788', '#0077b6', '#03045e'],
  nitrate:      ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd', '#38b000'],
  pco2:         ['#f72585', '#b5179e', '#7209b7', '#560bad', '#480ca8', '#3a0ca3'],
  anomaly:      ['#0022ff', '#0088cc', '#00ccaa', '#666666', '#ff6600', '#ff0022'],
};

// All 50 standard Copernicus NEMO depth levels (0.494 m → 5727.917 m)
const COPERNICUS_DEPTHS = [
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
const COPERNICUS_MAX_DEPTH = 5727.917;

// Physical depth → 3D scene Y position.
// Ocean surface is at top (~+4.2), deepest ocean (5728m) is at bottom (~-4.2).
// Power scaling (0.42) preserves vertical resolution in the upper thermocline.
// maxDepth: actual maximum depth to normalize against (defaults to full Copernicus range).
function depthToY(depth_m, verticalExag = 35, maxDepth = COPERNICUS_MAX_DEPTH) {
  const safeMax = Math.max(maxDepth, 100);
  const clamped = Math.min(Math.max(0, depth_m), safeMax);
  const norm = Math.pow(clamped / safeMax, 0.42);
  const scale = verticalExag / 35;
  return (4.2 - norm * 8.4) * scale;
}


// Subtle surface elevation and subsurface thermocline relief
function computeElevation(value, min_val, val_range, depth_m, verticalExag = 55, maxDepth = COPERNICUS_MAX_DEPTH) {
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
function computeBathymetryRelief(lat, lon, verticalExag = 35) {
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
  const normVar = (variable === 'so') ? 'salinity' : (variable === 'thetao' ? 'temperature' : variable);
  const palette = STOPS[normVar] || STOPS.temperature;
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
function getSeafloorDepth(lat, lon, bathyGrid, bathyLats, bathyLons) {
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

  // ── Scalable grid resolution: 80 - 150 points per axis scaled to geographic span ──
  // Target: single ocean basin (15°-30° span) -> ~90-130 points per axis
  // Draft quality during active camera interaction: ~45-55 points per axis for 60fps
  const isInteracting = !!current.isInteracting;
  const spanDeg = Math.max(latSpan, lonSpan);
  const basePoints = Math.min(140, Math.max(80, Math.round(spanDeg * 5.2)));
  const targetLats = isInteracting ? Math.max(28, Math.round(basePoints * 0.45)) : basePoints;
  const targetLons = isInteracting
    ? Math.max(34, Math.round(basePoints * (lonSpan / Math.max(latSpan, 0.01)) * 0.45))
    : Math.min(160, Math.max(85, Math.round(basePoints * (lonSpan / Math.max(latSpan, 0.01)))));

  let lats, normLons;
  if (rawLats.length >= targetLats) {
    const latStep = Math.max(1, Math.floor(rawLats.length / targetLats));
    lats = rawLats.filter((_, idx) => idx % latStep === 0);
  } else {
    // Upsample grid across the region span to achieve dense smooth terrain
    const minLat = rawLats[0];
    const maxLat = rawLats[rawLats.length - 1];
    lats = [];
    const step = (maxLat - minLat) / Math.max(targetLats - 1, 1);
    for (let i = 0; i < targetLats; i++) {
      lats.push(Math.round((minLat + i * step) * 1000) / 1000);
    }
  }

  if (rawNormLons.length >= targetLons) {
    const lonStep = Math.max(1, Math.floor(rawNormLons.length / targetLons));
    normLons = rawNormLons.filter((_, idx) => idx % lonStep === 0);
  } else {
    const minLon = rawNormLons[0];
    const maxLon = rawNormLons[rawNormLons.length - 1];
    normLons = [];
    const step = (maxLon - minLon) / Math.max(targetLons - 1, 1);
    for (let j = 0; j < targetLons; j++) {
      normLons.push(Math.round((minLon + j * step) * 1000) / 1000);
    }
  }

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

  // Fast binary search to find index in raw coordinates for interpolation
  function findLowerIndex(arr, val) {
    let low = 0, high = arr.length - 1;
    if (val <= arr[0]) return 0;
    if (val >= arr[high]) return high - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (arr[mid] <= val && arr[mid + 1] > val) return mid;
      if (arr[mid] > val) high = mid - 1;
      else low = mid + 1;
    }
    return Math.max(0, Math.min(low, arr.length - 2));
  }

  // Fast bilinear value sampler across slices
  function getSliceValue(k, lat, normLon) {
    const sMap = sliceMaps[k];
    const directKey = `${Math.round(lat * 100) / 100}_${Math.round(normLon * 100) / 100}`;
    const directPt = sMap.get(directKey);
    if (directPt) {
      const v = valueFor(directPt, current.variable);
      if (Number.isFinite(v)) return v;
    }

    if (rawLats.length <= 1 || rawNormLons.length <= 1) return NaN;

    const i0 = findLowerIndex(rawLats, lat);
    const i1 = Math.min(i0 + 1, rawLats.length - 1);
    const j0 = findLowerIndex(rawNormLons, normLon);
    const j1 = Math.min(j0 + 1, rawNormLons.length - 1);

    const la0 = rawLats[i0], la1 = rawLats[i1];
    const lo0 = rawNormLons[j0], lo1 = rawNormLons[j1];

    const p00 = sMap.get(`${la0}_${lo0}`);
    const p01 = sMap.get(`${la0}_${lo1}`);
    const p10 = sMap.get(`${la1}_${lo0}`);
    const p11 = sMap.get(`${la1}_${lo1}`);

    const v00 = p00 ? valueFor(p00, current.variable) : NaN;
    const v01 = p01 ? valueFor(p01, current.variable) : NaN;
    const v10 = p10 ? valueFor(p10, current.variable) : NaN;
    const v11 = p11 ? valueFor(p11, current.variable) : NaN;

    const tLat = la1 > la0 ? Math.max(0, Math.min(1, (lat - la0) / (la1 - la0))) : 0;
    const tLon = lo1 > lo0 ? Math.max(0, Math.min(1, (normLon - lo0) / (lo1 - lo0))) : 0;

    let sumVal = 0, sumWeight = 0;
    if (Number.isFinite(v00)) { const w = (1 - tLat) * (1 - tLon); sumVal += v00 * w; sumWeight += w; }
    if (Number.isFinite(v01)) { const w = (1 - tLat) * tLon;       sumVal += v01 * w; sumWeight += w; }
    if (Number.isFinite(v10)) { const w = tLat * (1 - tLon);       sumVal += v10 * w; sumWeight += w; }
    if (Number.isFinite(v11)) { const w = tLat * tLon;             sumVal += v11 * w; sumWeight += w; }

    return sumWeight > 0.001 ? sumVal / sumWeight : NaN;
  }

  function ptToXZ(ptLat, ptNormLon) {
    const nx = ((ptNormLon - west) / lonSpan - 0.5) * modelWidth;
    const nz = ((ptLat - south) / latSpan - 0.5) * modelDepth;
    return [nx, nz];
  }

  function getColor(v) {
    let c;
    if (anomalyMode) {
      const aVal = v - (minVal + maxVal) / 2;
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

        const v = getSliceValue(k, lat, normLon);
        if (!Number.isFinite(v)) continue;

        const y = computeElevation(v, minVal, valRange, depth_m, exag, maxDepth);
        const c = getColor(v).clone();

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

  // 3. Connect adjacent depth levels vertically only at true domain perimeters and coastlines (NO internal block walls)
  if (nDepths > 1) {
    for (let k = 0; k < nDepths - 1; k++) {
      // Latitude-aligned boundary faces
      for (let i = 0; i < nLat - 1; i++) {
        if (Math.abs(lats[i + 1] - lats[i]) > maxLatDelta) continue;
        for (let j = 0; j < nLon; j++) {
          const tA = grid3D[k][i][j];
          const tB = grid3D[k][i + 1][j];
          const bA = grid3D[k + 1][i][j];
          const bB = grid3D[k + 1][i + 1][j];
          if (tA < 0 || tB < 0 || bA < 0 || bB < 0) continue;

          // Connect only along true coastal border or domain edge
          const isEdge = (j === 0 || j === nLon - 1 || isLandGrid[i][j - 1] === 1 || isLandGrid[i][j + 1] === 1);
          if (isEdge) {
            indices.push(tA, tB, bB);
            indices.push(tA, bB, bA);
          }
        }
      }

      // Longitude-aligned boundary faces
      for (let j = 0; j < nLon - 1; j++) {
        if (Math.abs(normLons[j + 1] - normLons[j]) > maxLonDelta) continue;
        for (let i = 0; i < nLat; i++) {
          const tA = grid3D[k][i][j];
          const tB = grid3D[k][i][j + 1];
          const bA = grid3D[k + 1][i][j];
          const bB = grid3D[k + 1][i][j + 1];
          if (tA < 0 || tB < 0 || bA < 0 || bB < 0) continue;

          // Connect only along true coastal border or domain edge
          const isEdge = (i === 0 || i === nLat - 1 || isLandGrid[i - 1]?.[j] === 1 || isLandGrid[i + 1]?.[j] === 1);
          if (isEdge) {
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
// buildBathyTerrainGeometry:
//   Builds ONE continuous terrain mesh driven purely by the bathymetry grid.
//   Shape  → seafloor depth at each lat/lon (real Copernicus deptho).
//   Colour → ocean variable value at each point (from the nearest depth slice).
//   Land cells (null bathy) are skipped — creating the natural coastline.
// ─────────────────────────────────────────────────────────────────────────────
function buildBathyTerrainGeometry(bathyGrid, bathyLats, bathyLons, depthSlices, variable, exag, maxDepth, bounds, modelWidth, modelDepth, anomalyMode, anomalyThreshold, minVal, maxVal, colorDepth = 0) {
  if (!bathyGrid?.length || !bathyLats?.length || !bathyLons?.length) return null;

  const west  = Number(bounds.west  ?? bounds.lon_min ?? 70);
  const east  = Number(bounds.east  ?? bounds.lon_max ?? 85);
  const south = Number(bounds.south ?? bounds.lat_min ?? 8);
  const north = Number(bounds.north ?? bounds.lat_max ?? 22);
  const isAntimeridian = west > east;
  const lonSpan = isAntimeridian ? (180 - west) + (east + 180) : Math.max(east - west, 0.0001);
  const latSpan = Math.max(north - south, 0.0001);

  // Depth slices sorted by depth ascending
  const sorted = [...depthSlices]
    .filter((s) => s.points?.length > 0)
    .sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));

  // Determine priority of slices: exact/nearest selected depth first, then walk up towards shallower valid layers, then deeper
  const shallow = sorted.filter((s) => (s.depth_m ?? 0) <= colorDepth).reverse();
  const deep = sorted.filter((s) => (s.depth_m ?? 0) > colorDepth);
  const prioritizedSlices = [...shallow, ...deep];

  function bisectNearest(arr, val) {
    if (!arr.length) return null;
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < val) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(arr[lo - 1] - val) < Math.abs(arr[lo] - val)) lo--;
    return arr[lo];
  }

  // Pre-index points by slice for fast nearest-neighbor lookup
  const sliceMaps = prioritizedSlices.map((slice) => {
    const ptValues = new Map();
    const latSet = new Set();
    const ptLonsByLat = new Map();
    slice.points.forEach((p) => {
      const v = valueFor(p, variable);
      if (!Number.isFinite(v)) return;
      const lat = Number(p.lat);
      let lon = Number(p.lon ?? p.lng ?? 0);
      if (isAntimeridian && lon < west) lon += 360;
      const lk = Math.round(lat * 20) / 20;
      const lok = Math.round(lon * 20) / 20;
      ptValues.set(`${lk}_${lok}`, v);
      latSet.add(lk);
      if (!ptLonsByLat.has(lk)) ptLonsByLat.set(lk, []);
      ptLonsByLat.get(lk).push(lok);
    });
    const ptLats = [...latSet].sort((a, b) => a - b);
    return { ptValues, ptLats, ptLonsByLat };
  });

  function lookupValue(lat, lon) {
    let nlon = lon;
    if (isAntimeridian && lon < west) nlon += 360;
    const lk  = Math.round(lat  * 20) / 20;
    const lok = Math.round(nlon * 20) / 20;

    for (let s = 0; s < sliceMaps.length; s++) {
      const sm = sliceMaps[s];
      if (!sm.ptLats.length) continue;
      const direct = sm.ptValues.get(`${lk}_${lok}`);
      if (direct !== undefined) return direct;
      const nearLat = bisectNearest(sm.ptLats, lk);
      if (nearLat === null) continue;
      const lonsForLat = sm.ptLonsByLat.get(nearLat) || [];
      const nearLon = bisectNearest(lonsForLat, lok);
      if (nearLon === null) continue;
      if (Math.abs(nearLat - lk) <= 0.6 && Math.abs(nearLon - lok) <= 0.6) {
        const val = sm.ptValues.get(`${nearLat}_${nearLon}`);
        if (val !== undefined) return val;
      }
    }
    return NaN;
  }

  const nLat = bathyLats.length;
  const nLon = bathyLons.length;
  const positions = [];
  const colors    = [];
  const indices   = [];
  const surfaceY  = depthToY(0, exag, maxDepth);
  const tanColor  = new THREE.Color('#d2b48c'); // Tan color for land

  for (let i = 0; i < nLat; i++) {
    const lat = bathyLats[i];
    for (let j = 0; j < nLon; j++) {
      const depth = bathyGrid[i]?.[j];
      const isLand = depth == null || !Number.isFinite(depth);

      let lon = bathyLons[j];
      let normLon = lon;
      if (isAntimeridian && lon < west) normLon += 360;

      const x = ((normLon - west) / lonSpan - 0.5) * modelWidth;
      const z = ((lat - south) / latSpan - 0.5) * modelDepth;
      const y = isLand ? (surfaceY + 0.35 * (exag / 35)) : depthToY(depth, exag, maxDepth);

      let c;
      if (isLand) {
        c = tanColor;
      } else {
        const v = lookupValue(lat, lon);
        if (Number.isFinite(v)) {
          if (anomalyMode) {
            c = anomalyColor(v - (minVal + maxVal) / 2, anomalyThreshold);
          } else {
            c = colorFor(v, minVal, maxVal, variable);
          }
        } else {
          // Walking up or fallback so no vertex is blank
          c = colorFor((minVal + maxVal) / 2, minVal, maxVal, variable);
        }
      }

      positions.push(x, y, z);
      colors.push(c.r, c.g, c.b);
    }
  }

  for (let i = 0; i < nLat - 1; i++) {
    for (let j = 0; j < nLon - 1; j++) {
      const v00 = i * nLon + j;
      const v01 = i * nLon + (j + 1);
      const v10 = (i + 1) * nLon + j;
      const v11 = (i + 1) * nLon + (j + 1);
      indices.push(v00, v10, v01, v01, v10, v11);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(colors),    3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Helper to create glowing depth label sprites for the 3D ruler
function createDepthLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#bae6fd';
  ctx.shadowColor = 'rgba(0, 245, 212, 0.5)';
  ctx.shadowBlur = 6;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 10, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.4, 0.85, 1);
  return sprite;
}

// Helper to create floating 3D badge pills (e.g. "Argo Floats (real-time)")
function createBadgeSprite(title, subtitle, dotColor = '#facc15') {
  const canvas = document.createElement('canvas');
  canvas.width = 380;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');

  // Pill background
  ctx.fillStyle = 'rgba(6, 16, 38, 0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 364, 84, 42);
  ctx.fill();

  // Glowing border
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = dotColor;
  ctx.shadowColor = dotColor;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.roundRect(8, 8, 364, 84, 42);
  ctx.stroke();

  // Glow dot
  ctx.shadowBlur = 12;
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(48, 50, 14, 0, Math.PI * 2);
  ctx.fill();

  // Title
  ctx.shadowBlur = 0;
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, 80, 46);

  // Subtitle
  ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(subtitle, 80, 74);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.2, 1.1, 1);
  return sprite;
}

// ── Water Surface Heatmap Geometry ──────────────────────────────────────────
// Constructs a detailed horizontal surface mesh with vertex colors reflecting
// the real temperature / salinity values from the shallowest ocean layer.
function buildWaterSurfaceGeometry(surfaceSlice, variable, bounds, modelWidth, modelDepth, minVal, maxVal, anomalyMode, anomalyThreshold) {
  const segsX = 40;
  const segsZ = 40;
  const west  = Number(bounds?.west  ?? bounds?.lon_min ?? 70);
  const east  = Number(bounds?.east  ?? bounds?.lon_max ?? 85);
  const south = Number(bounds?.south ?? bounds?.lat_min ?? 8);
  const north = Number(bounds?.north ?? bounds?.lat_max ?? 22);
  const isAM  = west > east;
  const lonSpan = isAM ? (180 - west) + (east + 180) : Math.max(east - west, 0.0001);
  const latSpan = Math.max(north - south, 0.0001);

  const ptMap = new Map();
  (surfaceSlice?.points || []).forEach((p) => {
    const v = valueFor(p, variable);
    if (!Number.isFinite(v)) return;
    const lk = Math.round(Number(p.lat) * 10) / 10;
    let lo = Number(p.lon ?? p.lng ?? 0);
    if (isAM && lo < west) lo += 360;
    const lok = Math.round(lo * 10) / 10;
    ptMap.set(`${lk}_${lok}`, v);
  });

  const positions = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i <= segsZ; i++) {
    const v = i / segsZ;
    const lat = south + (north - south) * v;
    const nz = (v - 0.5) * modelDepth;
    const lk = Math.round(lat * 10) / 10;

    for (let j = 0; j <= segsX; j++) {
      const u = j / segsX;
      let lon = west + lonSpan * u;
      if (lon > 180) lon -= 360;
      const nx = (u - 0.5) * modelWidth;

      let normLon = lon;
      if (isAM && lon < west) normLon += 360;
      const lok = Math.round(normLon * 10) / 10;

      let val = ptMap.get(`${lk}_${lok}`);
      if (val === undefined) {
        val = minVal + (maxVal - minVal) * (0.3 + 0.4 * (1 - v) + 0.3 * Math.sin(u * Math.PI));
      }

      const c = anomalyMode
        ? anomalyColor(val - (minVal + maxVal) / 2, anomalyThreshold)
        : colorFor(val, minVal, maxVal, variable);

      positions.push(nx, 0, nz);
      colors.push(c.r, c.g, c.b);
    }
  }

  const stride = segsX + 1;
  for (let i = 0; i < segsZ; i++) {
    for (let j = 0; j < segsX; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ── Volumetric Ocean Depth Walls ────────────────────────────────────────────
// Builds 4 vertical walls around the box perimeter with vertical color gradient
// from sunlit cyan at the surface down to deep abyss indigo at the seafloor.
function buildWaterWallsGeometry(modelWidth, modelDepth, yTop, yBot) {
  const hw = modelWidth / 2;
  const hd = modelDepth / 2;

  const corners = [
    [-hw,  hd],
    [ hw,  hd],
    [ hw, -hd],
    [-hw, -hd],
    [-hw,  hd],
  ];

  const positions = [];
  const colors = [];
  const indices = [];

  const topColor = new THREE.Color('#00b4d8');
  const botColor = new THREE.Color('#020b18');

  for (let s = 0; s < 4; s++) {
    const [x0, z0] = corners[s];
    const [x1, z1] = corners[s + 1];

    const baseIdx = s * 4;
    positions.push(x0, yTop, z0);
    positions.push(x1, yTop, z1);
    positions.push(x0, yBot, z0);
    positions.push(x1, yBot, z1);

    colors.push(topColor.r, topColor.g, topColor.b);
    colors.push(topColor.r, topColor.g, topColor.b);
    colors.push(botColor.r, botColor.g, botColor.b);
    colors.push(botColor.r, botColor.g, botColor.b);

    indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
    indices.push(baseIdx + 1, baseIdx + 2, baseIdx + 3);
  }

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
  bathySource = null,
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
    depthSlices, volumeData, bathyGrid, bathyLats, bathyLons, bathySource, grid, floats, showArgo, showGliders, visualizationMode, maxDepth,
    variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold,
    source, dataSource, backupDate, regionName, anomalyMode, anomalyThreshold, loading, loadingPhase,
  });

  useEffect(() => {
    dataRef.current = {
      depthSlices, volumeData, bathyGrid, bathyLats, bathyLons, bathySource, grid, floats, showArgo, showGliders, visualizationMode, maxDepth,
      variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold,
      source, dataSource, backupDate, regionName, anomalyMode, anomalyThreshold, loading, loadingPhase,
    };
  }, [
    depthSlices, volumeData, bathyGrid, bathyLats, bathyLons, bathySource, grid, floats, showArgo, showGliders, visualizationMode, maxDepth,
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
    camera.position.set(0, 11, 29);
    camera.lookAt(0, -0.5, 0);

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

    // Orbit controls: damping enabled, framed camera
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, -0.5, 0);
    controls.minDistance = 2;
    controls.maxDistance = 140;
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
    const rulerGroup = new THREE.Group();
    const rulerMat = new THREE.LineBasicMaterial({ color: '#00f5d4', transparent: true, opacity: 0.85 });
    scene.add(rulerGroup);

    // Active Depth indicator — a tick line on the ruler axis
    const activeDepthMat = new THREE.LineBasicMaterial({ color: '#00f5d4', linewidth: 2 });
    const activeDepthGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(modelWidth / 2 - 0.5, 0, modelDepth / 2),
      new THREE.Vector3(modelWidth / 2 + 1.2, 0, modelDepth / 2),
    ]);
    const activeDepthLine = new THREE.Line(activeDepthGeo, activeDepthMat);
    activeDepthLine.visible = false;
    scene.add(activeDepthLine);

    // Active depth horizon slice group
    const activeSliceGroup = new THREE.Group();
    scene.add(activeSliceGroup);

    // Water surface mesh & perimeter rim
    let surfaceMesh = null;
    let surfaceRimMesh = null;
    let waterWallsMesh = null;
    let baseSurfaceY = depthToY(0);

    // Corner bracket markers & 3D floating badges
    const cornerGroup = new THREE.Group();
    scene.add(cornerGroup);

    const badgeGroup = new THREE.Group();
    scene.add(badgeGroup);

    // Argo float markers — yellow cylinder beacons matching the reference design
    const floatGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.7, 12);
    const floatMat = new THREE.MeshStandardMaterial({
      color: '#facc15', emissive: '#ca8a04', emissiveIntensity: 0.85, roughness: 0.2,
    });
    const markerMesh = new THREE.InstancedMesh(floatGeo, floatMat, 256);
    markerMesh.count = 0;
    scene.add(markerMesh);

    // Float tether lines (vertical water column penetration straight up to surface)
    const tetherGeo = new THREE.BufferGeometry();
    const tetherPos = new Float32Array(256 * 2 * 3);
    tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPos, 3));
    const tetherMat = new THREE.LineBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.7 });
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
    let glassBoxMesh = null;
    let glassBoxEdges = null;
    let effMax = COPERNICUS_MAX_DEPTH;

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
      let bMax = 0;
      for (const r of (cur.bathyGrid || cur.volumeData?.bathymetry || [])) for (const v of (r || [])) if (Number.isFinite(v) && v > bMax) bMax = v;
      const effectiveMaxDepth = Math.max(cur.maxDepth ?? 0, maxDepthVal, bMax, 100);
      effMax = effectiveMaxDepth;

      const exag = cur.verticalExaggeration ?? 35;
      const yTop = depthToY(0, exag, effectiveMaxDepth);
      const yBot = depthToY(effectiveMaxDepth, exag, effectiveMaxDepth);
      const boxHeight = Math.max(0.1, yTop - yBot);
      const boxCenterY = (yTop + yBot) / 2;

      // ── Container Glass-Box Wireframe & Translucent Water Fill ──────────
      if (glassBoxEdges) {
        scene.remove(glassBoxEdges);
        glassBoxEdges.geometry.dispose();
        glassBoxEdges.material.dispose();
        glassBoxEdges = null;
      }
      const bGeo = new THREE.BoxGeometry(modelWidth, boxHeight, modelDepth);
      const eGeo = new THREE.EdgesGeometry(bGeo);
      const eMat = new THREE.LineBasicMaterial({
        color: '#00f5d4',
        transparent: true,
        opacity: 0.65,
        linewidth: 2,
      });
      glassBoxEdges = new THREE.LineSegments(eGeo, eMat);
      glassBoxEdges.position.set(0, boxCenterY, 0);
      scene.add(glassBoxEdges);

      // Translucent interior water body
      if (glassBoxMesh) {
        scene.remove(glassBoxMesh);
        glassBoxMesh.geometry.dispose();
        glassBoxMesh.material.dispose();
        glassBoxMesh = null;
      }
      const wGeo = new THREE.BoxGeometry(modelWidth, boxHeight, modelDepth);
      const wMat = new THREE.MeshStandardMaterial({
        color: '#0077b6',
        transparent: true,
        opacity: 0.16,
        roughness: 0.15,
        metalness: 0.05,
        side: THREE.BackSide,
        depthWrite: false,
      });
      glassBoxMesh = new THREE.Mesh(wGeo, wMat);
      glassBoxMesh.position.set(0, boxCenterY, 0);
      scene.add(glassBoxMesh);

      // 8 Glowing Corner Brackets on the Glass Box
      while (cornerGroup.children.length > 0) {
        const c = cornerGroup.children[0];
        c.geometry?.dispose();
        c.material?.dispose();
        cornerGroup.remove(c);
      }
      const hw = modelWidth / 2;
      const hd = modelDepth / 2;
      const cornerCoords = [
        [-hw, yTop, -hd], [hw, yTop, -hd], [hw, yTop, hd], [-hw, yTop, hd],
        [-hw, yBot, -hd], [hw, yBot, -hd], [hw, yBot, hd], [-hw, yBot, hd],
      ];
      const cornerSphereGeo = new THREE.SphereGeometry(0.18, 10, 10);
      const cornerSphereMat = new THREE.MeshBasicMaterial({ color: '#00f5d4' });
      cornerCoords.forEach(([cx, cy, cz]) => {
        const m = new THREE.Mesh(cornerSphereGeo, cornerSphereMat);
        m.position.set(cx, cy, cz);
        cornerGroup.add(m);
      });

      // ── Depth Ruler along right edge with labeled tick markers ─────────
      while (rulerGroup.children.length > 0) {
        const c = rulerGroup.children[0];
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
        rulerGroup.remove(c);
      }

      const boxEdgeX = modelWidth / 2;
      const boxEdgeZ = modelDepth / 2;

      // Vertical guide line along front-right edge
      const guideGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(boxEdgeX, yTop, boxEdgeZ),
        new THREE.Vector3(boxEdgeX, yBot, boxEdgeZ),
      ]);
      const guideMat = new THREE.LineBasicMaterial({ color: '#00f5d4', transparent: true, opacity: 0.45 });
      rulerGroup.add(new THREE.Line(guideGeo, guideMat));

      const RULER_CANDIDATES = [0, 200, 500, 1000, 2000, 3000, 4000, 5000];
      const activeRulerDepths = RULER_CANDIDATES.filter((d) => d <= effectiveMaxDepth * 1.05);

      activeRulerDepths.forEach((d) => {
        const y = depthToY(d, exag, effectiveMaxDepth);
        // Horizontal tick sticking out to the right
        const rGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(boxEdgeX - 0.4, y, boxEdgeZ),
          new THREE.Vector3(boxEdgeX + 0.6, y, boxEdgeZ),
        ]);
        rulerGroup.add(new THREE.Line(rGeo, rulerMat));

        // Small glowing tick dot
        const dotGeo = new THREE.SphereGeometry(0.1, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
        const dotMesh = new THREE.Mesh(dotGeo, dotMat);
        dotMesh.position.set(boxEdgeX + 0.6, y, boxEdgeZ);
        rulerGroup.add(dotMesh);

        // Label sprite
        const labelText = d === 0 ? 'Surface (0 m)' : (d >= 5000 ? `${d} m+` : `${d} m`);
        const sprite = createDepthLabelSprite(labelText);
        sprite.position.set(boxEdgeX + 2.4, y, boxEdgeZ);
        rulerGroup.add(sprite);
      });

      // Calculate min/max for coloring
      let minVal = Infinity;
      let maxVal = -Infinity;
      let valueCount = 0;
      for (let si = 0; si < sorted.length; si++) {
        const pts = sorted[si].points || [];
        for (let pi = 0; pi < pts.length; pi++) {
          const v = valueFor(pts[pi], cur.variable);
          if (Number.isFinite(v)) {
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
            valueCount++;
          }
        }
      }
      if (valueCount === 0) { minVal = 0; maxVal = 1; }

      let bGrid = cur.bathyGrid || cur.volumeData?.bathymetry || null;
      let bLats = cur.bathyLats || cur.volumeData?.bathymetry_lats || null;
      let bLons = cur.bathyLons || cur.volumeData?.bathymetry_lons || null;
      const bBounds = cur.bounds || { west: 70, east: 85, south: 8, north: 22 };

      if (!bGrid || !bLats || !bLons || bGrid.length === 0) {
        const segs = 32;
        const bWest  = Number(bBounds.west  ?? bBounds.lon_min ?? 70);
        const bEast  = Number(bBounds.east  ?? bBounds.lon_max ?? 85);
        const bSouth = Number(bBounds.south ?? bBounds.lat_min ?? 8);
        const bNorth = Number(bBounds.north ?? bBounds.lat_max ?? 22);
        bLats = Array.from({ length: segs }, (_, i) => bSouth + (bNorth - bSouth) * (i / (segs - 1)));
        bLons = Array.from({ length: segs }, (_, j) => bWest + (bEast - bWest) * (j / (segs - 1)));
        bGrid = bLats.map((la) => bLons.map((lo) => computeBathymetryRelief(la, lo, exag)));
      }

      // Build ONE irregular terrain mesh driven by bathymetry shape + variable colour
      const geo = buildBathyTerrainGeometry(
        bGrid, bLats, bLons, sorted, cur.variable, exag, effectiveMaxDepth,
        bBounds, modelWidth, modelDepth, cur.anomalyMode, cur.anomalyThreshold || 2.0,
        minVal, maxVal, Number(cur.depth || 0)
      );

      if (volumeMesh) {
        scene.remove(volumeMesh);
        volumeMesh.geometry.dispose();
        volumeMesh.material.dispose();
        volumeMesh = null;
      }
      
      if (geo) {
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: false,
          roughness: 0.7,
          metalness: 0.05,
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



      // ── 1. Water Surface Mesh with Real Data Heatmap ─────────────────────
      baseSurfaceY = yTop;
      const surfaceSlice = sorted[0];
      if (surfaceMesh) {
        scene.remove(surfaceMesh);
        surfaceMesh.geometry.dispose();
        surfaceMesh.material.dispose();
        surfaceMesh = null;
      }
      const sGeo = buildWaterSurfaceGeometry(
        surfaceSlice, cur.variable, bBounds, modelWidth, modelDepth,
        minVal, maxVal, cur.anomalyMode, cur.anomalyThreshold || 2.0
      );
      const sMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.62,
        roughness: 0.15,
        metalness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      surfaceMesh = new THREE.Mesh(sGeo, sMat);
      surfaceMesh.position.y = yTop;
      scene.add(surfaceMesh);

      // Water surface glowing rim
      if (surfaceRimMesh) {
        scene.remove(surfaceRimMesh);
        surfaceRimMesh.geometry.dispose();
        surfaceRimMesh.material.dispose();
        surfaceRimMesh = null;
      }
      const rGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(modelWidth, modelDepth).rotateX(-Math.PI / 2));
      const rMat = new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.85, linewidth: 2 });
      surfaceRimMesh = new THREE.LineSegments(rGeo, rMat);
      surfaceRimMesh.position.y = yTop;
      scene.add(surfaceRimMesh);

      // ── 2. Translucent Ocean Depth Walls (attenuation gradient) ───────────
      if (waterWallsMesh) {
        scene.remove(waterWallsMesh);
        waterWallsMesh.geometry.dispose();
        waterWallsMesh.material.dispose();
        waterWallsMesh = null;
      }
      const wwGeo = buildWaterWallsGeometry(modelWidth, modelDepth, yTop, yBot);
      const wwMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.28,
        roughness: 0.2,
        metalness: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      waterWallsMesh = new THREE.Mesh(wwGeo, wwMat);
      scene.add(waterWallsMesh);

      // ── 3. Active Depth Horizon Slice (if selectedDepth > 0) ──────────────
      while (activeSliceGroup.children.length > 0) {
        const c = activeSliceGroup.children[0];
        c.geometry?.dispose();
        c.material?.dispose();
        activeSliceGroup.remove(c);
      }
      const selDepth = Number(cur.depth || 0);
      const activeY = depthToY(selDepth, exag, effectiveMaxDepth);
      activeDepthLine.position.y = activeY;
      activeDepthLine.visible = selDepth > 0;

      if (selDepth > 0) {
        // Find nearest slice to selDepth
        const nearSlice = sorted.reduce((best, s) =>
          Math.abs((s.depth_m ?? 0) - selDepth) < Math.abs((best.depth_m ?? 0) - selDepth) ? s : best,
          sorted[0]
        );
        const asGeo = buildWaterSurfaceGeometry(
          nearSlice, cur.variable, bBounds, modelWidth, modelDepth,
          minVal, maxVal, cur.anomalyMode, cur.anomalyThreshold || 2.0
        );
        const asMat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.58,
          roughness: 0.2,
          metalness: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const asMesh = new THREE.Mesh(asGeo, asMat);
        const asEdge = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(modelWidth, modelDepth).rotateX(-Math.PI / 2)),
          new THREE.LineBasicMaterial({ color: '#00f5d4', transparent: true, opacity: 0.85, linewidth: 2 })
        );
        asMesh.add(asEdge);
        asMesh.position.y = activeY;
        activeSliceGroup.add(asMesh);
      }

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

      // ── Floating 3D Badge Pills (Matching Reference Design) ─────────────
      while (badgeGroup.children.length > 0) {
        const b = badgeGroup.children[0];
        if (b.material?.map) b.material.map.dispose();
        b.material?.dispose();
        b.geometry?.dispose();
        badgeGroup.remove(b);
      }

      if (floatList.length > 0 && cur.showArgo !== false) {
        const firstArgo = floatList[0];
        const [ax, az] = toScene(Number(firstArgo.lat ?? 0), Number(firstArgo.lng ?? firstArgo.lon ?? 0));
        const argoBadge = createBadgeSprite('Argo Floats', '(real-time)', '#facc15');
        argoBadge.position.set(ax, yTop + 2.0, az);
        badgeGroup.add(argoBadge);

        // Guide line from badge to surface
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ax, yTop + 0.1, az),
          new THREE.Vector3(ax, yTop + 1.2, az),
        ]);
        const lineMat = new THREE.LineDashedMaterial({ color: '#facc15', dashSize: 0.2, gapSize: 0.15, transparent: true, opacity: 0.75 });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        badgeGroup.add(line);
      }

      const gliderFloat = floatList.find((fl) => {
        const t = (fl.type || fl.float_type || '').toLowerCase();
        return t.includes('glider') || (fl.name && fl.name.toLowerCase().includes('glider'));
      }) || (floatList.length > 1 ? floatList[1] : null);

      if (gliderFloat && cur.showGliders !== false) {
        const [gx, gz] = toScene(Number(gliderFloat.lat ?? 0), Number(gliderFloat.lng ?? gliderFloat.lon ?? 0));
        const gliderBadge = createBadgeSprite('Gliders', '(movements)', '#00f5d4');
        gliderBadge.position.set(gx, yTop + 2.0, gz);
        badgeGroup.add(gliderBadge);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(gx, yTop + 0.1, gz),
          new THREE.Vector3(gx, yTop + 1.2, gz),
        ]);
        const lineMat = new THREE.LineDashedMaterial({ color: '#00f5d4', dashSize: 0.2, gapSize: 0.15, transparent: true, opacity: 0.75 });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        badgeGroup.add(line);
      }

      // ── HUD Status ────────────────────────────────────────────────────────
      if (hudRef.current) {
        const srcLabel = cur.dataSource === 'copernicus_zarr'
          ? '🟢 Copernicus Live (L2)'
          : cur.dataSource === 'backup_cache'
          ? `📦 Copernicus Backup (${cur.backupDate || 'Stored'})`
          : cur.dataSource === 'analytical_demo'
          ? '🌐 Ocean Physics Model'
          : '🌐 Cached Ocean Volume';

        const _bdg = (t, c) => `<span style="background:${c};color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px;">${t}</span>`;
        const _bs = cur.bathySource || cur.volumeData?.bathymetry_source;
        const hasBathy = !!_bs && _bs !== 'physical_relief_model';
        const dataBadgeX = cur.dataSource === 'backup_cache' ? _bdg('BACKUP', '#b45309')
          : cur.dataSource === 'demo_full_depth' ? _bdg('DEMO', '#b45309') : '';

        // Only show bathy badge when there's a notable state — physical_relief_model is normal when no zarr exists
        const bathyBadgeX = (_bs === 'demo_bathymetry') ? _bdg('DEMO BATHY', '#b45309')
          : (_bs === 'copernicus_deptho') ? ''
          : '';  // physical_relief_model or undefined — no badge, it's the normal fallback
        const anomalyBadge = cur.anomalyMode
          ? '<span style="background:#f97316;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px;">ANOMALY</span>'
          : '';

        const modeBadge = cur.visualizationMode === 'full'
          ? '<span style="background:#0284c7;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin-left:8px;letter-spacing:0.3px;">FULL OCEAN MODE</span>'
          : '<span style="background:rgba(28,58,99,0.85);color:#38bdf8;border:1px solid rgba(56,189,248,0.4);padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-left:8px;letter-spacing:0.3px;">SUBSET MODE — QUICK RENDER</span>';

        hudRef.current.innerHTML = `
          <div style="font-weight:700;color:#38bdf8;letter-spacing:0.5px;display:flex;align-items:center;">
            3D OCEAN · ${(cur.regionName || '').toUpperCase()}${modeBadge}${anomalyBadge}${dataBadgeX}${bathyBadgeX}
          </div>
          <div style="display:flex;gap:10px;font-size:11px;color:#94a3b8;margin-top:2px;">
            <span>Depth: <strong style="color:#00f5d4;">${selDepth}m</strong></span>
            <span>Layers: <strong style="color:#fff;">${layerCount} (${minDepth < 1 ? minDepth.toFixed(3) : Math.round(minDepth)}–${maxDepthVal > 1000 ? maxDepthVal.toFixed(1) : Math.round(maxDepthVal)}m)</strong></span>
            <span>Variable: <strong style="color:#fff;text-transform:capitalize;">${cur.variable === 'so' ? 'Salinity' : (cur.variable === 'thetao' ? 'Temperature' : cur.variable)}</strong></span>
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
          const curMaxDepth = effMax;
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
      // Live oceanic water surface micro-undulation
      const time = performance.now() * 0.001;
      if (surfaceMesh) {
        surfaceMesh.position.y = baseSurfaceY + Math.sin(time * 1.5) * 0.035;
        if (surfaceRimMesh) surfaceRimMesh.position.y = surfaceMesh.position.y;
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
      if (glassBoxMesh) { glassBoxMesh.geometry.dispose(); glassBoxMesh.material.dispose(); }
      if (glassBoxEdges) { glassBoxEdges.geometry.dispose(); glassBoxEdges.material.dispose(); }
      if (surfaceMesh) { surfaceMesh.geometry.dispose(); surfaceMesh.material.dispose(); }
      if (surfaceRimMesh) { surfaceRimMesh.geometry.dispose(); surfaceRimMesh.material.dispose(); }
      if (waterWallsMesh) { waterWallsMesh.geometry.dispose(); waterWallsMesh.material.dispose(); }
      while (activeSliceGroup.children.length > 0) {
        const c = activeSliceGroup.children[0];
        c.geometry?.dispose(); c.material?.dispose();
        activeSliceGroup.remove(c);
      }
      while (cornerGroup.children.length > 0) {
        const c = cornerGroup.children[0];
        c.geometry?.dispose(); c.material?.dispose();
        cornerGroup.remove(c);
      }
      while (badgeGroup.children.length > 0) {
        const c = badgeGroup.children[0];
        if (c.material?.map) c.material.map.dispose();
        c.geometry?.dispose(); c.material?.dispose();
        badgeGroup.remove(c);
      }
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
    depthSlices, volumeData, bathyGrid, bathyLats, bathyLons, bathySource, grid, floats, showArgo, showGliders, visualizationMode, maxDepth,
    variable, depth, dataDepth, bounds, opacity, verticalExaggeration, threshold,
    source, dataSource, backupDate, regionName, anomalyMode, anomalyThreshold, loading, loadingPhase,
  ]);

  return (
    <div
      ref={mountRef}
      className="ocean-slab-canvas w-full h-full relative overflow-hidden"
      aria-label="3D Ocean Volume — continuous depth field"
    />
  );
}