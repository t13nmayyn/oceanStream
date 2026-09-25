import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const DEPTH_BINS = [0, 10, 50, 100, 200, 500, 1000];

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

export const TEMP_RELIEF_SCALE = 1.8;

export function computeElevation(temperature, min_temp, temp_range, depth_m, verticalExag = 35) {
  const normalizedTemp = Math.max(0, Math.min(1, (temperature - min_temp) / Math.max(temp_range, 0.0001)));
  const tempRelief = normalizedTemp * TEMP_RELIEF_SCALE * (verticalExag / 35);
  const depthNorm = Math.pow(Math.min(Math.max(0, depth_m), 1000) / 1000, 0.45);
  const depthBaseY = 4.8 - depthNorm * 9.6;
  return depthBaseY + (tempRelief - TEMP_RELIEF_SCALE * 0.5);
}

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

function anomalyColor(anomalyC, threshold = 2.0) {
  const twoThr = Math.max(threshold * 2, 0.001);
  const t = Math.max(0, Math.min(1, (anomalyC + twoThr) / (twoThr * 2)));
  return interpolateColor(t, STOPS.anomaly);
}

// buildConnectedVolume:
//   Constructs ONE connected 3D volumetric mesh from ALL assembled depth slices.
//   - Horizontal surface quads link adjacent lat/lon cells at each depth level.
//   - Vertical side-wall quads link adjacent depth levels at each lat/lon.
//   - Missing data cells are simply skipped (natural irregular boundary).
//   - Result: ONE BufferGeometry, ONE mesh, NO isolated pillars, NO cage box.
function buildConnectedVolume(slicesToRender, current, modelWidth, modelDepth) {
  const bounds = current.bounds || { west: 70, east: 85, south: 8, north: 22 };
  const west  = Number(bounds.west  ?? bounds.lon_min ?? 70);
  const east  = Number(bounds.east  ?? bounds.lon_max ?? 85);
  const south = Number(bounds.south ?? bounds.lat_min ?? 8);
  const north = Number(bounds.north ?? bounds.lat_max ?? 22);
  const lonSpan = Math.max(east - west, 0.0001);
  const latSpan = Math.max(north - south, 0.0001);

  const sorted = [...slicesToRender].sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));
  const nDepths = sorted.length;
  if (nDepths < 1) return null;

  const allValues = [];
  sorted.forEach((s) => (s.points || []).forEach((pt) => allValues.push(valueFor(pt, current.variable))));
  const minVal = allValues.length ? Math.min(...allValues) : 0;
  const maxVal = allValues.length ? Math.max(...allValues) : 1;
  const anomalyThr = current.anomalyThreshold || 2.0;
  const exag = current.verticalExaggeration ?? 35;
  const anomalyMode = current.anomalyMode ?? false;
  const thresholdFilter = current.threshold;

  // Build 2D grid topology from the shallowest slice
  const refPts = sorted[0]?.points || [];
  const totalPts = refPts.length;
  // Cap grid at ~900 cells per layer for performance
  const gridStep = Math.max(1, Math.ceil(Math.sqrt(totalPts / 900)));

  const latSet = new Set();
  const lonSet = new Set();
  refPts.forEach((pt) => {
    latSet.add(Math.round(Number(pt.lat) * 100) / 100);
    lonSet.add(Math.round(Number(pt.lon) * 100) / 100);
  });
  const latArr = [...latSet].sort((a, b) => a - b).filter((_, i) => i % gridStep === 0);
  const lonArr = [...lonSet].sort((a, b) => a - b).filter((_, i) => i % gridStep === 0);

  if (latArr.length < 2 || lonArr.length < 2) return null;

  const nLat = latArr.length;
  const nLon = lonArr.length;

  // Build data lookup map
  const dataMap = new Map();
  sorted.forEach((slice, dIdx) => {
    const depth_m = Number(slice.depth_m ?? 0);
    (slice.points || []).forEach((pt) => {
      const la = Math.round(Number(pt.lat) * 100) / 100;
      const lo = Math.round(Number(pt.lon) * 100) / 100;
      const key = `${la}_${lo}`;
      if (!dataMap.has(key)) dataMap.set(key, new Map());
      const val = valueFor(pt, current.variable);
      if (Number.isFinite(val)) {
        dataMap.get(key).set(dIdx, { value: val, anomaly_c: pt.anomaly_c ?? null, depth_m, pt });
      }
    });
  });

  // Node array: [iLat * nLon * nDepths + iLon * nDepths + iDepth]
  const totalNodes = nLat * nLon * nDepths;
  const nodeX = new Float32Array(totalNodes);
  const nodeY = new Float32Array(totalNodes);
  const nodeZ = new Float32Array(totalNodes);
  const nodeR = new Float32Array(totalNodes);
  const nodeG = new Float32Array(totalNodes);
  const nodeB = new Float32Array(totalNodes);
  const nodeValid = new Uint8Array(totalNodes);

  for (let iLat = 0; iLat < nLat; iLat++) {
    const la = latArr[iLat];
    for (let iLon = 0; iLon < nLon; iLon++) {
      const lo = lonArr[iLon];
      const key = `${la}_${lo}`;
      const depthMap = dataMap.get(key);
      const nx = ((lo - west) / lonSpan - 0.5) * modelWidth;
      const nz = ((la - south) / latSpan - 0.5) * modelDepth;

      for (let iD = 0; iD < nDepths; iD++) {
        const nodeIdx = iLat * nLon * nDepths + iLon * nDepths + iD;
        nodeX[nodeIdx] = nx;
        nodeZ[nodeIdx] = nz;
        const entry = depthMap?.get(iD);
        if (!entry) {
          nodeY[nodeIdx] = depthToY(sorted[iD]?.depth_m ?? 0);
          nodeValid[nodeIdx] = 0;
          continue;
        }
        const { value, anomaly_c, depth_m } = entry;
        nodeY[nodeIdx] = computeElevation(value, minVal, maxVal - minVal, depth_m, exag);
        let c;
        if (anomalyMode) {
          const aVal = anomaly_c ?? (value - (minVal + maxVal) / 2);
          c = anomalyColor(aVal, anomalyThr);
        } else {
          c = colorFor(value, minVal, maxVal, current.variable);
        }
        if (
          thresholdFilter?.enabled &&
          ((thresholdFilter.operator === '>' && value > thresholdFilter.value) ||
           (thresholdFilter.operator === '<' && value < thresholdFilter.value) ||
           Math.abs(value - thresholdFilter.value) <= thresholdFilter.tolerance)
        ) {
          c.set('#ffeb3b');
        }
        nodeR[nodeIdx] = c.r;
        nodeG[nodeIdx] = c.g;
        nodeB[nodeIdx] = c.b;
        nodeValid[nodeIdx] = 1;
      }
    }
  }

  // Emit triangles — connected surface + vertical walls
  const positions = [];
  const colors = [];

  function emitTriangle(n0, n1, n2) {
    positions.push(nodeX[n0], nodeY[n0], nodeZ[n0]);
    positions.push(nodeX[n1], nodeY[n1], nodeZ[n1]);
    positions.push(nodeX[n2], nodeY[n2], nodeZ[n2]);
    colors.push(nodeR[n0], nodeG[n0], nodeB[n0]);
    colors.push(nodeR[n1], nodeG[n1], nodeB[n1]);
    colors.push(nodeR[n2], nodeG[n2], nodeB[n2]);
  }

  function emitQuad(n00, n10, n01, n11) {
    if (!nodeValid[n00] || !nodeValid[n10] || !nodeValid[n01] || !nodeValid[n11]) return;
    emitTriangle(n00, n10, n11);
    emitTriangle(n00, n11, n01);
    emitTriangle(n00, n11, n10);
    emitTriangle(n00, n01, n11);
  }

  // A) Horizontal surface quads at each depth level
  for (let iD = 0; iD < nDepths; iD++) {
    for (let iLat = 0; iLat < nLat - 1; iLat++) {
      for (let iLon = 0; iLon < nLon - 1; iLon++) {
        const n00 = iLat * nLon * nDepths       + iLon * nDepths       + iD;
        const n10 = (iLat + 1) * nLon * nDepths + iLon * nDepths       + iD;
        const n01 = iLat * nLon * nDepths       + (iLon + 1) * nDepths + iD;
        const n11 = (iLat + 1) * nLon * nDepths + (iLon + 1) * nDepths + iD;
        emitQuad(n00, n10, n01, n11);
      }
    }
  }

  // B) Vertical side-wall quads connecting adjacent depth levels
  for (let iD = 0; iD < nDepths - 1; iD++) {
    for (let iLat = 0; iLat < nLat - 1; iLat++) {
      for (let iLon = 0; iLon < nLon; iLon++) {
        const nTop0 = iLat * nLon * nDepths       + iLon * nDepths + iD;
        const nTop1 = (iLat + 1) * nLon * nDepths + iLon * nDepths + iD;
        const nBot0 = iLat * nLon * nDepths       + iLon * nDepths + (iD + 1);
        const nBot1 = (iLat + 1) * nLon * nDepths + iLon * nDepths + (iD + 1);
        emitQuad(nTop0, nTop1, nBot0, nBot1);
      }
    }
    for (let iLat = 0; iLat < nLat; iLat++) {
      for (let iLon = 0; iLon < nLon - 1; iLon++) {
        const nTop0 = iLat * nLon * nDepths + iLon * nDepths       + iD;
        const nTop1 = iLat * nLon * nDepths + (iLon + 1) * nDepths + iD;
        const nBot0 = iLat * nLon * nDepths + iLon * nDepths       + (iD + 1);
        const nBot1 = iLat * nLon * nDepths + (iLon + 1) * nDepths + (iD + 1);
        emitQuad(nTop0, nTop1, nBot0, nBot1);
      }
    }
  }

  if (positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.computeVertexNormals();

  geo.userData = {
    latArr, lonArr, sorted,
    nLat, nLon, nDepths,
    west, east, south, north, lonSpan, latSpan,
    modelWidth, modelDepth, minVal, maxVal,
    variable: current.variable,
  };

  return geo;
}

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

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b14');
    scene.fog = new THREE.FogExp2('#070b14', 0.014);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 14, 26);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor('#070b14', 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

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

    const exagBadge = document.createElement('div');
    exagBadge.style.cssText = [
      'position:absolute', 'bottom:52px', 'left:14px', 'pointer-events:none',
      'font-family:ui-monospace,monospace', 'color:#8EA4C8', 'font-size:10px', 'z-index:10',
    ].join(';');
    mount.appendChild(exagBadge);

    const loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = [
      'position:absolute', 'inset:0', 'display:none', 'align-items:center',
      'justify-content:center', 'flex-direction:column', 'gap:12px',
      'background:rgba(7,11,20,0.78)', 'z-index:30', 'backdrop-filter:blur(3px)',
    ].join(';');
    loadingOverlay.innerHTML = '<div style="width:48px;height:48px;border:3px solid #1C3A63;border-top-color:#00f5d4;border-radius:50%;animation:oceanSpin 0.9s linear infinite;"></div><div style="color:#00f5d4;font-size:13px;font-weight:600;letter-spacing:0.5px;">Fetching ocean data\u2026</div><div style="color:#8EA4C8;font-size:11px;max-width:240px;text-align:center;">Checking L1 \u2192 L2 \u2192 Backup \u2192 Copernicus</div>';
    const styleEl = document.createElement('style');
    styleEl.textContent = '@keyframes oceanSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(styleEl);
    mount.appendChild(loadingOverlay);

    const tooltip = document.createElement('div');
    tooltip.style.cssText = [
      'position:absolute', 'pointer-events:none',
      'background:rgba(7,16,33,0.96)', 'border:1px solid #00f5d4', 'color:#fff',
      'padding:8px 12px', 'border-radius:8px',
      'font-size:11px', 'font-family:ui-monospace,monospace', 'z-index:20',
      'display:none', 'transform:translate(-50%,-115%)',
      'box-shadow:0 4px 18px rgba(0,245,212,0.25)', 'white-space:nowrap', 'line-height:1.6',
    ].join(';');
    mount.appendChild(tooltip);
    tooltipRef.current = tooltip;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controls.minDistance = 6;
    controls.maxDistance = 70;
    controls.update();

    scene.add(new THREE.AmbientLight('#ffffff', 2.2));
    const sun = new THREE.DirectionalLight('#e0f2fe', 2.6);
    sun.position.set(16, 30, 20);
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#00f5d4', 1.1);
    fill.position.set(-18, -8, -14);
    scene.add(fill);

    const modelWidth  = 18;
    const modelDepth  = 14;

    // Depth ruler ticks only — no cage box
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

    const planeMat = new THREE.MeshBasicMaterial({ color: '#00f5d4', transparent: true, opacity: 0.10, side: THREE.DoubleSide });
    const planeGeo = new THREE.PlaneGeometry(modelWidth, modelDepth);
    planeGeo.rotateX(Math.PI / 2);
    const activePlane = new THREE.Mesh(planeGeo, planeMat);
    scene.add(activePlane);

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

    const arrowGeo = new THREE.ConeGeometry(0.14, 0.44, 6);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshStandardMaterial({ color: '#00f5d4', emissive: '#0077b6', emissiveIntensity: 0.8 });
    const vectorMesh = new THREE.InstancedMesh(arrowGeo, arrowMat, 1200);
    vectorMesh.count = 0;
    vectorMesh.visible = false;
    scene.add(vectorMesh);

    let volumeMesh = null;
    let gridMeta = null;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredFloat = null;

    const update = () => {
      const cur = dataRef.current;
      loadingOverlay.style.display = cur.loading === true ? 'flex' : 'none';

      const rawSlices = cur.depthSlices?.length
        ? cur.depthSlices
        : cur.volumeData?.depth_slices || [];

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

      if (volumeMesh) {
        scene.remove(volumeMesh);
        volumeMesh.geometry.dispose();
        volumeMesh.material.dispose();
        volumeMesh = null;
        gridMeta = null;
      }

      if (!slicesToRender.length) {
        if (hudRef.current) {
          hudRef.current.innerHTML = '<div style="font-weight:700;color:#38bdf8;">3D OCEAN VOLUME</div><div style="font-size:11px;color:#94a3b8;">No data loaded \u2014 waiting for cache\u2026</div>';
        }
        return;
      }

      const sorted = [...slicesToRender].sort((a, b) => (a.depth_m ?? 0) - (b.depth_m ?? 0));
      const minDepth = sorted[0]?.depth_m ?? 0;
      const maxDepthVal = sorted[sorted.length - 1]?.depth_m ?? 1000;
      const layerCount = sorted.length;

      const geo = buildConnectedVolume(sorted, {
        ...cur,
        bounds: cur.bounds || { west: 70, east: 85, south: 8, north: 22 },
      }, modelWidth, modelDepth);

      if (geo) {
        const mat = new THREE.MeshStandardMaterial({
          vertexColors: true,
          transparent: true,
          opacity: cur.opacity ?? 0.92,
          roughness: 0.30,
          metalness: 0.06,
          side: THREE.DoubleSide,
        });
        volumeMesh = new THREE.Mesh(geo, mat);
        scene.add(volumeMesh);
        gridMeta = geo.userData;
      }

      exagBadge.textContent = 'Vertical exaggeration: ' + (cur.verticalExaggeration ?? 35) + '\u00D7  |  Physical depth: 0\u2013' + maxDepthVal + 'm';

      const selDepth = Number(cur.depth || 0);
      activePlane.position.y = depthToY(selDepth);

      const boundsRef = cur.bounds || { west: 70, east: 85, south: 8, north: 22 };
      const bWest  = Number(boundsRef.west  ?? boundsRef.lon_min ?? 70);
      const bEast  = Number(boundsRef.east  ?? boundsRef.lon_max ?? 85);
      const bSouth = Number(boundsRef.south ?? boundsRef.lat_min ?? 8);
      const bNorth = Number(boundsRef.north ?? boundsRef.lat_max ?? 22);
      const lonSpanV = Math.max(bEast - bWest, 0.0001);
      const latSpanV = Math.max(bNorth - bSouth, 0.0001);

      if (cur.variable === 'currents') {
        vectorMesh.visible = true;
        let arrowIdx = 0;
        const pts = sorted[0]?.points || [];
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
          const nx = ((Number(pt.lon) - bWest) / lonSpanV - 0.5) * modelWidth;
          const nz = ((Number(pt.lat) - bSouth) / latSpanV - 0.5) * modelDepth;
          const angle = Math.atan2(u, v);
          rot.set(0, angle, 0);
          quat.setFromEuler(rot);
          pos.set(nx, depthToY(0) + 0.5, nz);
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

      const floatList = cur.floats || [];
      const floatCount = Math.min(floatList.length, 256);
      markerMesh.count = floatCount;
      const mtx2 = new THREE.Matrix4();
      const pos2 = new THREE.Vector3();
      const quat2 = new THREE.Quaternion();
      const sc2   = new THREE.Vector3(1.1, 1.1, 1.1);
      floatList.slice(0, floatCount).forEach((fl, idx) => {
        const fx = ((Number(fl.lng ?? fl.lon) - bWest) / lonSpanV - 0.5) * modelWidth;
        const fz = ((Number(fl.lat)           - bSouth) / latSpanV - 0.5) * modelDepth;
        const fy = depthToY(Number(fl.depth ?? fl.data_depth ?? 50));
        pos2.set(fx, fy, fz);
        mtx2.compose(pos2, quat2, sc2);
        markerMesh.setMatrixAt(idx, mtx2);
        const off = idx * 6;
        tetherPos[off]     = fx; tetherPos[off + 1] = depthToY(0); tetherPos[off + 2] = fz;
        tetherPos[off + 3] = fx; tetherPos[off + 4] = fy;          tetherPos[off + 5] = fz;
      });
      markerMesh.instanceMatrix.needsUpdate = true;
      tetherGeo.attributes.position.needsUpdate = true;

      if (hudRef.current) {
        const srcLabel = cur.dataSource === 'copernicus_zarr'
          ? '\uD83D\uDFE2 Copernicus Live (L2)'
          : cur.dataSource === 'backup_cache'
          ? '\uD83D\uDCE6 Copernicus Backup (' + (cur.backupDate || 'Stored') + ')'
          : cur.dataSource === 'analytical_demo'
          ? '\uD83C\uDF10 Analytical Ocean Model'
          : '\uD83C\uDF10 Cached Ocean Volume';
        const anomalyBadge = cur.anomalyMode
          ? '<span style="background:#f97316;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px;">ANOMALY</span>'
          : '';
        hudRef.current.innerHTML =
          '<div style="font-weight:700;color:#38bdf8;letter-spacing:0.5px;">3D OCEAN VOLUME \u00B7 ' + (cur.regionName || '').toUpperCase() + anomalyBadge + '</div>' +
          '<div style="display:flex;gap:10px;font-size:11px;color:#94a3b8;">' +
            '<span>Depth: <strong style="color:#00f5d4;">' + selDepth + 'm</strong></span>' +
            '<span>Layers: <strong style="color:#fff;">' + layerCount + ' (' + minDepth + '\u2013' + maxDepthVal + 'm)</strong></span>' +
            '<span>Variable: <strong style="color:#fff;text-transform:capitalize;">' + cur.variable + '</strong></span>' +
          '</div>' +
          '<div style="font-size:10.5px;color:#cbd5e1;margin-top:2px;">' + srcLabel + '</div>';
      }
    };

    update();
    sceneRef.current = { update };

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

    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const floatHit = raycaster.intersectObject(markerMesh)[0];
      if (floatHit && dataRef.current.floats[floatHit.instanceId]) {
        const fl = dataRef.current.floats[floatHit.instanceId];
        hoveredFloat = fl;
        renderer.domElement.style.cursor = 'pointer';
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'block';
          tooltipRef.current.style.left = (e.clientX - rect.left) + 'px';
          tooltipRef.current.style.top  = (e.clientY - rect.top) + 'px';
          const wmo  = fl.platform_number || fl.id || 'Argo';
          const temp = fl.temperature != null ? Number(fl.temperature).toFixed(2) + ' \u00B0C' : '\u2014';
          const sal  = fl.salinity    != null ? Number(fl.salinity).toFixed(2) + ' PSU' : '\u2014';
          const d    = fl.depth       != null ? Math.round(fl.depth) + ' m' : '0 m';
          tooltipRef.current.innerHTML =
            '<div style="color:#00f5d4;font-weight:700;margin-bottom:3px;">Argo Float #' + wmo + '</div>' +
            '<div>Depth: ' + d + '</div>' +
            '<div>Temperature: ' + temp + '</div>' +
            '<div>Salinity: ' + sal + '</div>' +
            '<div style="color:#38bdf8;font-size:10px;margin-top:3px;">Click for depth profile</div>';
        }
        return;
      }
      hoveredFloat = null;

      if (volumeMesh && gridMeta) {
        const volumeHit = raycaster.intersectObject(volumeMesh)[0];
        if (volumeHit) {
          renderer.domElement.style.cursor = 'crosshair';
          const hp = volumeHit.point;
          const { west: gW, lonSpan: gLS, south: gS, latSpan: gLAS, modelWidth: mW, modelDepth: mD, sorted: sliceMeta, variable: varName } = gridMeta;
          const hitLon = (hp.x / mW + 0.5) * gLS + gW;
          const hitLat = (hp.z / mD + 0.5) * gLAS + gS;
          const normD = Math.max(0, Math.min(1, (4.8 - hp.y) / 9.6));
          const hitDepth = Math.pow(normD, 1.0 / 0.45) * 1000;

          let closestDepthM = null;
          let closestVal = null;
          let closestSlice = null;
          let minDist = Infinity;
          (sliceMeta || []).forEach((slice) => {
            const dd = Math.abs((slice.depth_m ?? 0) - hitDepth);
            if (dd < minDist) { minDist = dd; closestDepthM = slice.depth_m ?? 0; closestSlice = slice; }
          });
          if (closestSlice) {
            let bestDist = Infinity;
            (closestSlice.points || []).forEach((pt) => {
              const dLat = Number(pt.lat) - hitLat;
              const dLon = Number(pt.lon) - hitLon;
              const dd = dLat * dLat + dLon * dLon;
              if (dd < bestDist) { bestDist = dd; closestVal = valueFor(pt, varName); }
            });
          }
          if (tooltipRef.current) {
            tooltipRef.current.style.display = 'block';
            tooltipRef.current.style.left = (e.clientX - rect.left) + 'px';
            tooltipRef.current.style.top  = (e.clientY - rect.top) + 'px';
            const latStr = hitLat >= 0 ? hitLat.toFixed(2) + '\u00B0 N' : (-hitLat).toFixed(2) + '\u00B0 S';
            const lonStr = hitLon >= 0 ? hitLon.toFixed(2) + '\u00B0 E' : (-hitLon).toFixed(2) + '\u00B0 W';
            const depthStr = closestDepthM != null ? closestDepthM.toFixed(1) + ' m' : hitDepth.toFixed(0) + ' m';
            const units = { temperature: '\u00B0C', salinity: 'PSU', currents: 'm/s', chlorophyll: 'mg/m\u00B3', oxygen: 'mmol/m\u00B3', ph: 'pH', nitrate: 'mmol/m\u00B3', pco2: '\u03BCatm' };
            const unit = units[varName] || '';
            const valStr = closestVal != null && Number.isFinite(closestVal) ? closestVal.toFixed(3) + ' ' + unit : '\u2014';
            tooltipRef.current.innerHTML =
              '<div style="color:#38bdf8;font-weight:700;margin-bottom:4px;font-size:11px;">Scientific Inspector</div>' +
              '<div style="color:#94a3b8;font-size:10px;">Location</div>' +
              '<div>Lat: <strong>' + latStr + '</strong></div>' +
              '<div>Lon: <strong>' + lonStr + '</strong></div>' +
              '<div>Depth: <strong style="color:#00f5d4;">' + depthStr + '</strong></div>' +
              '<div style="color:#94a3b8;font-size:10px;margin-top:3px;">Measurement</div>' +
              '<div style="text-transform:capitalize;">' + varName + ': <strong style="color:#ffd166;">' + valStr + '</strong></div>';
          }
          return;
        }
      }
      renderer.domElement.style.cursor = 'default';
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    };

    const onClick = () => { if (hoveredFloat) onSelectMarker?.(hoveredFloat); };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

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
      planeGeo.dispose(); planeMat.dispose();
      floatGeo.dispose(); floatMat.dispose();
      arrowGeo.dispose(); arrowMat.dispose();
      tetherGeo.dispose(); tetherMat.dispose();
      rulerMat.dispose();
      renderer.dispose();
      styleEl.remove();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(hud))             mount.removeChild(hud);
      if (mount.contains(exagBadge))       mount.removeChild(exagBadge);
      if (mount.contains(tooltip))         mount.removeChild(tooltip);
      if (mount.contains(loadingOverlay))  mount.removeChild(loadingOverlay);
      hudRef.current = null;
      tooltipRef.current = null;
    };
  }, [onSelectMarker]); // eslint-disable-line react-hooks/exhaustive-deps

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
      aria-label="3D Ocean Volume -- continuous connected depth field"
    />
  );
}
