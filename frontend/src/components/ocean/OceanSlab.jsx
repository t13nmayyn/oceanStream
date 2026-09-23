/**
 * OceanSlab.jsx — 3D Volumetric Ocean Block / Layered Thermal Field
 * ================================================================
 *
 * Core Features:
 *   1. 3D Volumetric Ocean Block: 0, 10, 50, 100, 200, 500, 1000m continuous layers.
 *   2. Mountain-like / terrain-like stratified structure driven by thermal topography.
 *   3. Smooth interpolation between depth layers with scientifically calibrated palettes.
 *   4. Argo profile overlays extending vertically through the 3D ocean volume.
 *   5. Seamless recoloring on variable change (temperature, salinity, currents, chlorophyll, oxygen).
 *   6. Zero blank initial frame: immediately renders "Indian Ocean Reference / Demo Field"
 *      before smoothly transitioning to real live or backup Zarr data.
 *   7. OrbitControls (rotate, zoom, pan) with 30-50x vertical exaggeration.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getOceanVariableValue } from '../../utils/oceanThermalField';

export const DEPTH_BINS = [0, 10, 50, 100, 200, 500, 1000];

// Scientifically tailored color palettes
const PALETTES = {
  temperature: ['#1e1b4b', '#1e3a8a', '#0284c7', '#06b6d4', '#10b981', '#facc15', '#f97316', '#dc2626'],
  salinity:    ['#312e81', '#4338ca', '#0891b2', '#059669', '#65a30d', '#ca8a04', '#eab308'],
  chlorophyll: ['#022c22', '#064e3b', '#047857', '#059669', '#10b981', '#34d399', '#a7f3d0'],
  oxygen:      ['#450a0a', '#991b1b', '#d97706', '#0284c7', '#2563eb', '#4338ca', '#312e81'],
  currents:    ['#0f172a', '#1e3a8a', '#0284c7', '#06b6d4', '#10b981', '#facc15', '#ef4444'],
  ph:          ['#dc2626', '#ea580c', '#eab308', '#84cc16', '#16a34a', '#06b6d4'],
};

// Variable value ranges for normalized color interpolation
const VARIABLE_DOMAINS = {
  temperature: [2.0, 31.0],
  salinity:    [32.0, 37.0],
  chlorophyll: [0.02, 2.5],
  oxygen:      [30.0, 260.0],
  currents:    [0.0, 1.8],
  ph:          [7.6, 8.3],
};

function getVariableValue(point, variable) {
  if (!point) return NaN;
  if (variable === 'currents') {
    const u = point.current_u_ms ?? point.uo;
    const v = point.current_v_ms ?? point.vo;
    if (u != null && v != null) return Math.hypot(Number(u), Number(v));
    if (point.current_speed_ms != null) return Number(point.current_speed_ms);
    return NaN;
  }
  const aliases = {
    temperature: ['temperature_c', 'temperature', 'thetao', 'temp'],
    salinity:    ['salinity_psu', 'salinity', 'so'],
    chlorophyll: ['chlorophyll_mgl', 'chlorophyll', 'chl'],
    oxygen:      ['oxygen_mmolm3', 'oxygen', 'dissolved_oxygen', 'o2'],
    ph:          ['ph', 'pH'],
  };
  const keys = aliases[variable] || aliases.temperature;
  for (const k of keys) {
    if (point[k] != null && point[k] !== '') {
      const num = Number(point[k]);
      if (Number.isFinite(num)) return num;
    }
  }
  if (point.value != null) {
    const num = Number(point.value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}

function colorForValue(val, min, max, variable) {
  const palette = PALETTES[variable] || PALETTES.temperature;
  const span = Math.max(max - min, 0.0001);
  const t = Math.max(0, Math.min(1, (val - min) / span));
  const scaled = t * (palette.length - 1);
  const idx = Math.min(Math.floor(scaled), palette.length - 2);
  const frac = scaled - idx;
  const c1 = new THREE.Color(palette[idx]);
  const c2 = new THREE.Color(palette[idx + 1]);
  return c1.lerp(c2, frac);
}

// Non-linear depth mapping so thermocline (0–200m) is visually rich and distinct from deep ocean
function depthToY(depthM, totalHeight = 12, exaggeration = 35) {
  const normalized = Math.pow(Math.max(0, Math.min(1000, depthM)) / 1000, 0.58);
  const scaleFactor = Math.min(2.0, Math.max(0.6, exaggeration / 35));
  return -normalized * totalHeight * scaleFactor;
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
  opacity = 0.85,
  verticalExaggeration = 35,
  source = 'reference',
  dataSource = null,
  backupDate = null,
  regionName = 'Indian Ocean',
  onSelectMarker,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const [activeFloatInfo, setActiveFloatInfo] = useState(null);

  // Bounds fallback: default Indian Ocean segment
  const currentBounds = useMemo(() => {
    return {
      south: Number(bounds?.south ?? bounds?.lat_min ?? 8),
      north: Number(bounds?.north ?? bounds?.lat_max ?? 20),
      west:  Number(bounds?.west  ?? bounds?.lon_min ?? 71),
      east:  Number(bounds?.east  ?? bounds?.lon_max ?? 88),
    };
  }, [bounds]);

  // Keep live references for Three.js render loop
  const stateRef = useRef({
    depthSlices,
    volumeData,
    grid,
    floats,
    variable,
    depth,
    dataDepth,
    bounds: currentBounds,
    opacity,
    verticalExaggeration,
    source,
    dataSource,
    backupDate,
  });

  useEffect(() => {
    stateRef.current = {
      depthSlices,
      volumeData,
      grid,
      floats,
      variable,
      depth,
      dataDepth,
      bounds: currentBounds,
      opacity,
      verticalExaggeration,
      source,
      dataSource,
      backupDate,
    };
  }, [depthSlices, volumeData, grid, floats, variable, depth, dataDepth, currentBounds, opacity, verticalExaggeration, source, dataSource, backupDate]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── 1. Three.js Scene Setup ──────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070d18'); // Deep marine background

    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.1, 1500);
    camera.position.set(22, 16, 26);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, -6, 0);
    controls.minDistance = 8;
    controls.maxDistance = 120;
    controls.update();

    // ── 2. Lighting ──────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight('#a5b4fc', 1.4));
    const sunLight = new THREE.DirectionalLight('#ffffff', 2.0);
    sunLight.position.set(16, 24, 18);
    scene.add(sunLight);

    const blueFill = new THREE.DirectionalLight('#0284c7', 1.0);
    blueFill.position.set(-16, -10, -12);
    scene.add(blueFill);

    // ── 3. Bounding Volume Structure ────────────────────────────────────
    const BOX_WIDTH = 22;
    const BOX_DEPTH = 15;
    const BOX_HEIGHT = 12;

    // Outer wireframe bounding cage
    const boxGeo = new THREE.BoxGeometry(BOX_WIDTH, BOX_HEIGHT, BOX_DEPTH);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    const boxFrame = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.45 })
    );
    boxFrame.position.set(0, -BOX_HEIGHT / 2, 0);
    scene.add(boxFrame);

    // Subtle translucent water volume block
    const volumeMat = new THREE.MeshBasicMaterial({
      color: '#0369a1',
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const volumeBlock = new THREE.Mesh(boxGeo, volumeMat);
    volumeBlock.position.set(0, -BOX_HEIGHT / 2, 0);
    scene.add(volumeBlock);

    // Bathymetry floor grid at 1000m depth
    const seafloorGrid = new THREE.GridHelper(BOX_WIDTH, 14, '#1e293b', '#0f172a');
    seafloorGrid.position.set(0, -BOX_HEIGHT, 0);
    scene.add(seafloorGrid);

    // Subtle surface grid
    const surfaceGrid = new THREE.GridHelper(BOX_WIDTH, 14, '#38bdf8', '#0284c7');
    surfaceGrid.position.set(0, 0, 0);
    surfaceGrid.material.opacity = 0.25;
    surfaceGrid.material.transparent = true;
    scene.add(surfaceGrid);

    // Depth markers along the vertical side pillar
    const markerLines = [];
    DEPTH_BINS.forEach((d) => {
      const y = depthToY(d, BOX_HEIGHT, 35);
      markerLines.push(-BOX_WIDTH / 2, y, -BOX_DEPTH / 2, -BOX_WIDTH / 2 + 0.6, y, -BOX_DEPTH / 2);
      markerLines.push(-BOX_WIDTH / 2, y, BOX_DEPTH / 2, -BOX_WIDTH / 2 + 0.6, y, BOX_DEPTH / 2);
    });
    const depthTicksGeo = new THREE.BufferGeometry();
    depthTicksGeo.setAttribute('position', new THREE.Float32BufferAttribute(markerLines, 3));
    const depthTicks = new THREE.LineSegments(
      depthTicksGeo,
      new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.85 })
    );
    scene.add(depthTicks);

    // Active selected depth scanning frame
    const scannerGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(BOX_WIDTH, BOX_DEPTH));
    const scannerMat = new THREE.LineBasicMaterial({ color: '#38bdf8', linewidth: 2, transparent: true, opacity: 0.9 });
    const scannerPlane = new THREE.LineSegments(scannerGeo, scannerMat);
    scannerPlane.rotation.x = Math.PI / 2;
    scene.add(scannerPlane);

    // ── 4. Multi-Layer Volumetric Meshes ──────────────────────────────────
    // Create 7 continuous depth layer planes matching DEPTH_BINS
    const layerMeshes = [];
    const layerCanvases = [];
    const layerTextures = [];

    DEPTH_BINS.forEach((depthM, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      layerCanvases.push(canvas);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      layerTextures.push(texture);

      const planeGeo = new THREE.PlaneGeometry(BOX_WIDTH, BOX_DEPTH, 24, 18);
      const planeMat = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: Math.max(0.65, 0.92 - idx * 0.035),
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 0.4,
        metalness: 0.1,
      });

      const mesh = new THREE.Mesh(planeGeo, planeMat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = depthToY(depthM, BOX_HEIGHT, 35);
      mesh.renderOrder = 2 + idx;
      scene.add(mesh);
      layerMeshes.push(mesh);
    });

    // ── 5. Current Vector Streamlines ────────────────────────────────────
    const vectorGeo = new THREE.BufferGeometry();
    const vectorMat = new THREE.LineBasicMaterial({
      color: '#00ffff',
      transparent: true,
      opacity: 0.85,
    });
    const currentVectors = new THREE.LineSegments(vectorGeo, vectorMat);
    currentVectors.renderOrder = 15;
    scene.add(currentVectors);

    // ── 6. Argo Float Profile 3D Overlays ────────────────────────────────
    const argoGroup = new THREE.Group();
    argoGroup.renderOrder = 20;
    scene.add(argoGroup);

    const buoyGeo = new THREE.SphereGeometry(0.38, 16, 14);
    const buoyMat = new THREE.MeshStandardMaterial({
      color: '#06b6d4',
      roughness: 0.2,
      metalness: 0.4,
      emissive: '#0891b2',
      emissiveIntensity: 0.4,
    });

    const profileLinesGeo = new THREE.BufferGeometry();
    const profileLinesMat = new THREE.LineBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.85,
    });
    const profileLines = new THREE.LineSegments(profileLinesGeo, profileLinesMat);
    argoGroup.add(profileLines);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let floatBuoyMeshes = [];

    // ── 7. Render & Update Logic ─────────────────────────────────────────
    const updateScene = () => {
      const state = stateRef.current;
      const { south, north, west, east } = state.bounds;
      const dLon = Math.max(east - west, 0.0001);
      const dLat = Math.max(north - south, 0.0001);
      const exaggeration = state.verticalExaggeration || 35;
      const activeVariable = state.variable || 'temperature';
      const [domainMin, domainMax] = VARIABLE_DOMAINS[activeVariable] || [0, 30];

      // Update active depth scanner position
      const activeY = depthToY(state.depth, BOX_HEIGHT, exaggeration);
      scannerPlane.position.y = activeY;

      // Extract slices from volumeData or fallback depthSlices
      const realSlices = state.volumeData?.depth_slices?.length
        ? state.volumeData.depth_slices
        : state.depthSlices;

      // Update all 7 continuous depth layers
      DEPTH_BINS.forEach((binDepth, layerIdx) => {
        const mesh = layerMeshes[layerIdx];
        const canvas = layerCanvases[layerIdx];
        const texture = layerTextures[layerIdx];
        const targetY = depthToY(binDepth, BOX_HEIGHT, exaggeration);
        mesh.position.y = targetY;

        // Find slice data for this depth
        const sliceData = realSlices.find((s) => Math.abs((s.depth_m ?? s.depth) - binDepth) < 15);
        const hasRealSlice = Boolean(sliceData && sliceData.points && sliceData.points.length > 0);
        const points = hasRealSlice ? sliceData.points : null;

        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const imgData = ctx.createImageData(w, h);

        // Displace layer vertices for mountain-like stratified relief
        const posAttr = mesh.geometry.attributes.position;
        const vertexCount = posAttr.count;

        for (let y = 0; y < h; y++) {
          const lat = north - (y / (h - 1)) * dLat;
          for (let x = 0; x < w; x++) {
            const lon = west + (x / (w - 1)) * dLon;

            let val;
            if (hasRealSlice && points) {
              // Inverse-distance weighting from nearby points
              let sum = 0, weightSum = 0;
              for (let i = 0; i < Math.min(points.length, 30); i++) {
                const p = points[i];
                const pVal = getVariableValue(p, activeVariable);
                if (Number.isFinite(pVal)) {
                  const dist = Math.hypot(p.lat - lat, p.lon - lon) + 0.05;
                  const weight = 1 / (dist * dist);
                  sum += pVal * weight;
                  weightSum += weight;
                }
              }
              val = weightSum > 0 ? sum / weightSum : getOceanVariableValue(lat, lon, activeVariable, binDepth);
            } else {
              // Immediate Reference Field: high-fidelity analytical model
              val = getOceanVariableValue(lat, lon, activeVariable, binDepth);
            }

            const col = colorForValue(val, domainMin, domainMax, activeVariable);
            const pIdx = (y * w + x) * 4;
            imgData.data[pIdx]     = Math.round(col.r * 255);
            imgData.data[pIdx + 1] = Math.round(col.g * 255);
            imgData.data[pIdx + 2] = Math.round(col.b * 255);
            imgData.data[pIdx + 3] = Math.round(255 * (state.opacity || 0.85));
          }
        }

        ctx.putImageData(imgData, 0, 0);
        texture.needsUpdate = true;

        // Apply mountain/topographic relief displacement to mesh vertices
        for (let i = 0; i < vertexCount; i++) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          // Convert plane coordinates back to normalized space [0, 1]
          const nx = (vx / BOX_WIDTH) + 0.5;
          const ny = (vy / BOX_DEPTH) + 0.5;
          const sampleLat = south + ny * dLat;
          const sampleLon = west + nx * dLon;
          const sampleVal = getOceanVariableValue(sampleLat, sampleLon, 'temperature', binDepth);
          const thermalRelief = ((sampleVal - domainMin) / Math.max(domainMax - domainMin, 1)) * 0.8;
          // Z displacement on plane is vertical relief along layer
          posAttr.setZ(i, (thermalRelief - 0.4) * (1.2 / Math.max(1, layerIdx * 0.5 + 1)));
        }
        posAttr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
      });

      // ── Current Vectors (when variable is currents) ───────────────────
      if (activeVariable === 'currents' && realSlices.length > 0) {
        const surfaceSlice = realSlices[0]?.points || [];
        const lines = [];
        surfaceSlice.forEach((p) => {
          const u = Number(p.current_u_ms ?? 0);
          const v = Number(p.current_v_ms ?? 0);
          if (u !== 0 || v !== 0) {
            const px = ((p.lon - west) / dLon - 0.5) * BOX_WIDTH;
            const pz = ((p.lat - south) / dLat - 0.5) * BOX_DEPTH;
            const py = 0;
            const len = Math.min(2.5, Math.hypot(u, v) * 3.5);
            const headX = px + (u / (Math.hypot(u, v) || 1)) * len;
            const headZ = pz - (v / (Math.hypot(u, v) || 1)) * len;
            lines.push(px, py, pz, headX, py, headZ);
          }
        });
        vectorGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
        currentVectors.visible = lines.length > 0;
      } else {
        currentVectors.visible = false;
      }

      // ── Argo Profile Overlays ─────────────────────────────────────────
      // Remove old buoy meshes
      floatBuoyMeshes.forEach((m) => argoGroup.remove(m));
      floatBuoyMeshes = [];

      const profileSegments = [];
      const floatList = state.floats || [];

      floatList.forEach((float, fIdx) => {
        const flon = Number(float.lng ?? float.lon ?? 0);
        const flat = Number(float.lat ?? 0);
        if (flon < west - 2 || flon > east + 2 || flat < south - 2 || flat > north + 2) return;

        const x = ((flon - west) / dLon - 0.5) * BOX_WIDTH;
        const z = ((flat - south) / dLat - 0.5) * BOX_DEPTH;
        const maxDepthM = Number(float.depth_range_m?.[1] ?? 1000);
        const bottomY = depthToY(maxDepthM, BOX_HEIGHT, exaggeration);

        // Vertical profile column extending through the ocean volume
        profileSegments.push(x, 0, z, x, bottomY, z);

        // Observation node ticks down the profile
        [10, 50, 100, 200, 500, 1000].forEach((d) => {
          if (d <= maxDepthM) {
            const nodeY = depthToY(d, BOX_HEIGHT, exaggeration);
            profileSegments.push(x - 0.25, nodeY, z, x + 0.25, nodeY, z);
          }
        });

        // Surface buoy mesh
        const isBgc = float.type === 'bgc' || float.marker_type === 'bgc_float';
        const buoyMesh = new THREE.Mesh(
          buoyGeo,
          new THREE.MeshStandardMaterial({
            color: isBgc ? '#10b981' : '#00f0ff',
            emissive: isBgc ? '#047857' : '#0284c7',
            emissiveIntensity: 0.5,
            roughness: 0.2,
          })
        );
        buoyMesh.position.set(x, 0.2, z);
        buoyMesh.userData = { float, index: fIdx };
        argoGroup.add(buoyMesh);
        floatBuoyMeshes.push(buoyMesh);
      });

      profileLinesGeo.setAttribute('position', new THREE.Float32BufferAttribute(profileSegments, 3));
      argoGroup.visible = floatList.length > 0;
    };

    updateScene();
    sceneRef.current = { update: updateScene };

    // ── 8. Interaction & Raycasting ──────────────────────────────────────
    const handlePointerClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(floatBuoyMeshes, false);
      if (intersects.length > 0) {
        const clickedFloat = intersects[0].object.userData.float;
        setActiveFloatInfo(clickedFloat);
        onSelectMarker?.(clickedFloat);
      }
    };
    renderer.domElement.addEventListener('click', handlePointerClick);

    // ── 9. Resize & Animation Loop ───────────────────────────────────────
    let frameId;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(mount);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      renderer.domElement.removeEventListener('click', handlePointerClick);
      controls.dispose();
      renderer.dispose();
      layerTextures.forEach((t) => t.dispose());
      layerMeshes.forEach((m) => m.geometry.dispose());
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // Update on prop changes
  useEffect(() => {
    sceneRef.current?.update();
  }, [depthSlices, volumeData, grid, floats, variable, depth, dataDepth, currentBounds, opacity, verticalExaggeration, source, dataSource, backupDate]);

  // Determine source badge label
  const isBackup = dataSource === 'backup_cache' || source === 'backup_cache';
  const isLive = dataSource === 'copernicus_zarr' || source === 'copernicus_zarr';

  const badgeText = isLive
    ? 'Copernicus Live Analysis'
    : isBackup
    ? `Copernicus Backup Snapshot (${backupDate || 'Stored'})`
    : `${regionName} Reference / Demo Field`;

  const badgeColor = isLive
    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    : isBackup
    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
    : 'bg-amber-500/20 text-amber-300 border-amber-500/40';

  return (
    <div className="relative w-full h-full min-h-[420px] bg-[#070d18] rounded-xl overflow-hidden select-none">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Top Left: 3D Ocean Volume Status Badge */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
        <div className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border backdrop-blur-md shadow-md ${badgeColor}`}>
          {badgeText}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/50 backdrop-blur-sm">
          <span>SURFACE: 0m</span>
          <span>•</span>
          <span>DEPTH: 1000m (Layered Stratification)</span>
        </div>
      </div>

      {/* Floating Active Float HUD (on float click) */}
      {activeFloatInfo && (
        <div className="absolute top-3 right-3 z-20 bg-slate-900/95 border border-cyan-500/40 p-3 rounded-xl shadow-2xl backdrop-blur-md text-slate-200 text-xs w-[240px]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-cyan-400">Argo Float #{activeFloatInfo.platform_number || activeFloatInfo.id}</span>
            <button
              onClick={() => setActiveFloatInfo(null)}
              className="text-slate-400 hover:text-white cursor-pointer px-1 text-sm leading-none"
            >
              ×
            </button>
          </div>
          <div className="space-y-1 font-mono text-[11px] text-slate-300">
            <div>Type: <span className="text-teal-400 uppercase font-semibold">{activeFloatInfo.type || 'Core'}</span></div>
            <div>Position: {Number(activeFloatInfo.lat).toFixed(2)}°N, {Number(activeFloatInfo.lon ?? activeFloatInfo.lng).toFixed(2)}°E</div>
            <div>Profile Range: 0 → {activeFloatInfo.depth_range_m?.[1] || 1000}m</div>
            {activeFloatInfo.temperature != null && <div>Temp: <span className="text-amber-400">{activeFloatInfo.temperature}°C</span></div>}
          </div>
        </div>
      )}

      {/* Vertical Depth Reference Axis (Left Bottom) */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 text-[10px] text-slate-400 font-mono bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-700/50 backdrop-blur-sm pointer-events-none">
        <span>Vertical exaggeration: ~{verticalExaggeration}×</span>
        <span>•</span>
        <span>Orbit: Left-drag | Zoom: Scroll</span>
      </div>
    </div>
  );
}
