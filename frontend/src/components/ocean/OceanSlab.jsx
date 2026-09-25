import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEPTH_BINS = [0, 10, 50, 100, 200, 500, 1000];

// Scientific color ramps
const STOPS = {
  temperature: ['#0033cc', '#00b4d8', '#00e08c', '#ffd166', '#ff7700', '#f54375'],
  salinity: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#e0aaff', '#7209b7'],
  currents: ['#051923', '#006494', '#00a6fb', '#0582ca', '#00f5d4', '#70e000'],
  chlorophyll: ['#081c15', '#1b4332', '#2d6a4f', '#52b788', '#95d5b2', '#d8f3dc'],
  oxygen: ['#3a0ca3', '#4361ee', '#4cc9f0', '#70e000', '#ffaa00', '#ff0054'],
  ph: ['#d00000', '#e85d04', '#ffba08', '#52b788', '#0077b6', '#03045e'],
  nitrate: ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd', '#38b000'],
  pco2: ['#f72585', '#b5179e', '#7209b7', '#560bad', '#480ca8', '#3a0ca3'],
};

export const TEMP_RELIEF_SCALE = 1.8;

export function computeElevation(temperature, min_temp, temp_range, depth_m, verticalExag = 35) {
  const normalizedTemp = Math.max(0, Math.min(1, (temperature - min_temp) / Math.max(temp_range, 0.0001)));
  const tempRelief = normalizedTemp * TEMP_RELIEF_SCALE * (verticalExag / 35);
  // Perceptual depth mapping: distributes upper layers and deep water naturally
  const depthNorm = Math.pow(Math.min(Math.max(0, depth_m), 1000) / 1000, 0.45);
  const depthBaseY = 4.8 - depthNorm * 9.6;
  return depthBaseY + (tempRelief - TEMP_RELIEF_SCALE * 0.5);
}

function valueFor(point, variable) {
  const aliases = {
    temperature: ['temperature_c', 'temperature', 'thetao', 'temp'],
    salinity: ['salinity_psu', 'salinity', 'so'],
    currents: ['current_speed', 'velocity'],
    chlorophyll: ['chlorophyll_mgl', 'chlorophyll', 'chl'],
    oxygen: ['oxygen_mmolm3', 'oxygen', 'dissolved_oxygen', 'o2'],
    ph: ['ph', 'pH'],
    nitrate: ['nitrate_mmolm3', 'nitrate', 'no3'],
    pco2: ['pco2_uatm', 'pco2', 'spco2'],
  };
  if (variable === 'currents') {
    return Math.hypot(Number(point?.current_u_ms ?? point?.uo ?? 0), Number(point?.current_v_ms ?? point?.vo ?? 0));
  }
  const key = (aliases[variable] || aliases.temperature).find((name) => point?.[name] != null);
  return Number(point?.[key] ?? 0);
}

function interpolateColor(t, palette) {
  const clampedT = Math.max(0, Math.min(1, t));
  const segmentCount = palette.length - 1;
  const segment = Math.min(Math.floor(clampedT * segmentCount), segmentCount - 1);
  const segmentT = (clampedT - segment / segmentCount) * segmentCount;

  const c1 = new THREE.Color(palette[segment]);
  const c2 = new THREE.Color(palette[segment + 1]);
  return c1.lerp(c2, segmentT);
}

function colorFor(value, min, max, variable) {
  const palette = STOPS[variable] || STOPS.temperature;
  const range = Math.max(max - min, 0.0001);
  const t = (value - min) / range;
  return interpolateColor(t, palette);
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
  onSelectMarker,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const hudRef = useRef(null);
  const tooltipRef = useRef(null);

  const dataRef = useRef({
    depthSlices,
    volumeData,
    grid,
    floats,
    variable,
    depth,
    dataDepth,
    bounds,
    opacity,
    verticalExaggeration,
    threshold,
    source,
    dataSource,
    backupDate,
    regionName,
  });

  useEffect(() => {
    dataRef.current = {
      depthSlices,
      volumeData,
      grid,
      floats,
      variable,
      depth,
      dataDepth,
      bounds,
      opacity,
      verticalExaggeration,
      threshold,
      source,
      dataSource,
      backupDate,
      regionName,
    };
  }, [
    depthSlices,
    volumeData,
    grid,
    floats,
    variable,
    depth,
    dataDepth,
    bounds,
    opacity,
    verticalExaggeration,
    threshold,
    source,
    dataSource,
    backupDate,
    regionName,
  ]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    // ── 1. Scene setup ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b14');

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 14, 25);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor('#070b14', 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // ── HUD Layer & Tooltip ───────────────────────────────────────────────────
    const hud = document.createElement('div');
    hud.className = 'ocean-slab-hud';
    hud.style.cssText = [
      'position:absolute',
      'top:12px',
      'left:14px',
      'pointer-events:none',
      'font-family:ui-sans-serif,system-ui,sans-serif',
      'color:#e2e8f0',
      'background:rgba(11,30,61,0.85)',
      'backdrop-filter:blur(6px)',
      'padding:8px 12px',
      'border-radius:8px',
      'border:1px solid rgba(28,58,99,0.7)',
      'font-size:12px',
      'z-index:10',
      'display:flex',
      'flex-direction:column',
      'gap:3px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
    ].join(';');
    mount.appendChild(hud);
    hudRef.current = hud;

    const tooltip = document.createElement('div');
    tooltip.className = 'argo-tooltip';
    tooltip.style.cssText = [
      'position:absolute',
      'pointer-events:none',
      'background:rgba(7,16,33,0.92)',
      'border:1px solid #00f5d4',
      'color:#ffffff',
      'padding:6px 10px',
      'border-radius:6px',
      'font-size:11px',
      'font-family:monospace',
      'z-index:20',
      'display:none',
      'transform:translate(-50%, -120%)',
      'box-shadow:0 2px 10px rgba(0,245,212,0.3)',
      'white-space:nowrap',
    ].join(';');
    mount.appendChild(tooltip);
    tooltipRef.current = tooltip;

    // ── Orbit Controls ────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);
    controls.minDistance = 8;
    controls.maxDistance = 65;
    controls.update();

    // ── 2. Scientific Lighting ────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight('#ffffff', 1.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight('#e0f2fe', 2.2);
    sunLight.position.set(16, 30, 20);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight('#00f5d4', 0.9);
    fillLight.position.set(-18, -8, -14);
    scene.add(fillLight);

    // ── 3. 3D Bounding Cage & Depth Ruler ─────────────────────────────────────
    const modelWidth = 18;
    const modelDepth = 14;
    const modelHeight = 10.4;

    const cageGroup = new THREE.Group();
    scene.add(cageGroup);

    // Box wireframe
    const boxGeo = new THREE.BoxGeometry(modelWidth, modelHeight, modelDepth);
    const boxMat = new THREE.MeshBasicMaterial({
      color: '#1e3a5f',
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.set(0, 0, 0);
    cageGroup.add(boxMesh);

    // Bottom grid (1000m abyss floor)
    const gridHelper = new THREE.GridHelper(modelWidth, 12, '#00f5d4', '#152e4d');
    gridHelper.position.set(0, -modelHeight / 2, 0);
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    cageGroup.add(gridHelper);

    // Active Slice Frame Outline
    const activeFrameGeo = new THREE.RingGeometry(modelWidth * 0.49, modelWidth * 0.50, 4);
    activeFrameGeo.rotateX(Math.PI / 2);
    const activeFrameMat = new THREE.MeshBasicMaterial({
      color: '#00f5d4',
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const activeFrameMesh = new THREE.Mesh(activeFrameGeo, activeFrameMat);
    scene.add(activeFrameMesh);

    // ── 4. Instanced Mesh for Volumetric Ocean Layers ─────────────────────────
    const MAX_VOXELS = 8500;
    const voxelGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.45, 6);
    const voxelMat = new THREE.MeshStandardMaterial({
      roughness: 0.28,
      metalness: 0.15,
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    });
    const voxelMesh = new THREE.InstancedMesh(voxelGeo, voxelMat, MAX_VOXELS);
    voxelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(voxelMesh);

    // ── 5. Argo Float Markers ──
    const floatGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const floatMat = new THREE.MeshStandardMaterial({
      color: '#00f5d4',
      emissive: '#00e5ff',
      emissiveIntensity: 0.9,
      roughness: 0.1,
    });
    const markerMesh = new THREE.InstancedMesh(floatGeo, floatMat, 256);
    scene.add(markerMesh);

    // Float tether lines
    const tetherLinesGeo = new THREE.BufferGeometry();
    const tetherPositions = new Float32Array(256 * 2 * 3);
    tetherLinesGeo.setAttribute('position', new THREE.BufferAttribute(tetherPositions, 3));
    const tetherMat = new THREE.LineBasicMaterial({
      color: '#00f5d4',
      transparent: true,
      opacity: 0.4,
    });
    const tetherLines = new THREE.LineSegments(tetherLinesGeo, tetherMat);
    scene.add(tetherLines);

    // ── 6. Flow Vector Arrows (Active on Currents) ────────────────────────────
    const MAX_VECTORS = 1200;
    const arrowGeo = new THREE.ConeGeometry(0.16, 0.5, 6);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshStandardMaterial({
      color: '#00f5d4',
      emissive: '#0077b6',
      emissiveIntensity: 0.8,
    });
    const vectorMesh = new THREE.InstancedMesh(arrowGeo, arrowMat, MAX_VECTORS);
    vectorMesh.visible = false;
    scene.add(vectorMesh);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredFloat = null;

    // ── Update Volume Function ────────────────────────────────────────────────
    const update = () => {
      const current = dataRef.current;
      const rawSlices = current.depthSlices?.length
        ? current.depthSlices
        : current.volumeData?.depth_slices || [];

      // If no multi-depth slices from API, use current grid as surface and synthesize depth column
      let slicesToRender = [];
      const baseGrid = current.grid || [];

      if (rawSlices.length > 0) {
        slicesToRender = rawSlices;
      } else if (baseGrid.length > 0) {
        // Synthesize 5 depth levels from base grid using oceanographic thermocline decay
        const synthDepths = [0, 50, 100, 200, 500, 1000];
        slicesToRender = synthDepths.map((dM) => {
          const decay = Math.exp(-dM / 220.0);
          return {
            depth_m: dM,
            points: baseGrid.map((p) => {
              const baseTemp = Number(p.temperature_c ?? p.value ?? 26.0);
              const decayedTemp = 4.0 + (baseTemp - 4.0) * decay;
              const baseSal = Number(p.salinity_psu ?? 34.5);
              const decayedSal = 34.7 + (baseSal - 34.7) * Math.exp(-dM / 350.0);
              return {
                ...p,
                depth_m: dM,
                temperature_c: decayedTemp,
                salinity_psu: decayedSal,
                current_u_ms: (p.current_u_ms ?? 0) * decay,
                current_v_ms: (p.current_v_ms ?? 0) * decay,
              };
            }),
          };
        });
      }

      if (!slicesToRender.length) return;

      const currentBounds = current.bounds || { west: 70, east: 85, south: 8, north: 22 };
      const west = Number(currentBounds.west ?? currentBounds.lon_min ?? 70);
      const east = Number(currentBounds.east ?? currentBounds.lon_max ?? 85);
      const south = Number(currentBounds.south ?? currentBounds.lat_min ?? 8);
      const north = Number(currentBounds.north ?? currentBounds.lat_max ?? 22);

      // Collect all values to get global volume min/max
      let allValues = [];
      slicesToRender.forEach((s) => {
        (s.points || []).forEach((pt) => {
          allValues.push(valueFor(pt, current.variable));
        });
      });
      if (!allValues.length) allValues = [0, 1];
      const minVal = Math.min(...allValues);
      const maxVal = Math.max(...allValues);
      const valRange = Math.max(maxVal - minVal, 0.0001);

      const selDepth = Number(current.depth || 0);
      const exag = current.verticalExaggeration ?? 35;

      // Update HUD
      if (hudRef.current) {
        const layerCount = slicesToRender.length;
        const srcLabel = current.dataSource === 'copernicus_zarr'
          ? '🟢 Copernicus Live (L2 Cache)'
          : current.dataSource === 'backup_cache'
          ? `📦 Copernicus Backup (${current.backupDate || 'Stored'})`
          : current.dataSource === 'analytical_demo'
          ? '🌐 Analytical Ocean Model (Demo Field)'
          : '🌐 Cached Ocean Volume';

        hudRef.current.innerHTML = `
          <div style="font-weight:700; color:#38bdf8; letter-spacing:0.5px;">3D OCEAN VOLUME · ${current.regionName.toUpperCase()}</div>
          <div style="display:flex; gap:10px; font-size:11px; color:#94a3b8;">
            <span>Target Depth: <strong style="color:#00f5d4;">${selDepth}m</strong></span>
            <span>Layers: <strong style="color:#ffffff;">${layerCount} Slices (0–1000m)</strong></span>
            <span>Variable: <strong style="color:#ffffff; text-transform:capitalize;">${current.variable}</strong></span>
          </div>
          <div style="font-size:10.5px; color:#cbd5e1; margin-top:2px;">
            ${srcLabel}
          </div>
        `;
      }

      // Position Active Frame Outline at the selected depth
      const activeDepthY = computeElevation(maxVal, minVal, valRange, selDepth, exag);
      activeFrameMesh.position.set(0, activeDepthY, 0);

      // ── Populate Voxels across all depth slices ────────────────────────────
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const rotation = new THREE.Euler();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();

      let vIdx = 0;
      const budgetPerSlice = Math.max(100, Math.floor(MAX_VOXELS / Math.max(1, slicesToRender.length)));

      slicesToRender.forEach((slice) => {
        const sDepth = Number(slice.depth_m ?? 0);
        const pts = slice.points || [];
        if (!pts.length) return;

        const isTargetDepth = Math.abs(sDepth - selDepth) <= 25.0;
        const step = Math.max(1, Math.floor(pts.length / budgetPerSlice));

        for (let i = 0; i < pts.length && vIdx < MAX_VOXELS; i += step) {
          const pt = pts[i];
          const val = valueFor(pt, current.variable);

          const normX = ((Number(pt.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * modelWidth;
          const normZ = ((Number(pt.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * modelDepth;
          const yPos = computeElevation(val, minVal, valRange, sDepth, exag);

          position.set(normX, yPos, normZ);
          // Highlight active depth slice slightly larger
          const vScale = isTargetDepth ? 1.25 : 0.95;
          const vHeight = isTargetDepth ? 0.6 : 0.38;
          scale.set(vScale, vHeight, vScale);
          matrix.compose(position, quaternion, scale);
          voxelMesh.setMatrixAt(vIdx, matrix);

          const col = colorFor(val, minVal, maxVal, current.variable);
          // Highlight threshold filter if active
          if (
            current.threshold?.enabled &&
            ((current.threshold.operator === '>' && val > current.threshold.value) ||
              (current.threshold.operator === '<' && val < current.threshold.value) ||
              Math.abs(val - current.threshold.value) <= current.threshold.tolerance)
          ) {
            col.set('#ffeb3b');
          }

          voxelMesh.setColorAt(vIdx, col);
          vIdx++;
        }
      });

      voxelMesh.count = vIdx;
      voxelMesh.instanceMatrix.needsUpdate = true;
      if (voxelMesh.instanceColor) voxelMesh.instanceColor.needsUpdate = true;
      voxelMat.opacity = current.opacity ?? 0.94;

      // ── Current Flow Vectors ──────────────────────────────────────────────
      if (current.variable === 'currents') {
        vectorMesh.visible = true;
        let arrowIdx = 0;
        const surfaceSlice = slicesToRender[0];
        const pts = surfaceSlice?.points || [];
        const arrowStep = Math.max(1, Math.floor(pts.length / MAX_VECTORS));

        for (let i = 0; i < pts.length && arrowIdx < MAX_VECTORS; i += arrowStep) {
          const pt = pts[i];
          const u = Number(pt.current_u_ms ?? 0);
          const v = Number(pt.current_v_ms ?? 0);
          const speed = Math.hypot(u, v);
          if (speed < 0.005) continue;

          const normX = ((Number(pt.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * modelWidth;
          const normZ = ((Number(pt.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * modelDepth;
          const yPos = computeElevation(speed, minVal, valRange, 0, exag) + 0.4;

          const angle = Math.atan2(u, v);
          rotation.set(0, angle, 0);
          quaternion.setFromEuler(rotation);
          position.set(normX, yPos, normZ);
          scale.set(1, 1, Math.min(2.5, 0.8 + speed * 4));
          matrix.compose(position, quaternion, scale);
          vectorMesh.setMatrixAt(arrowIdx, matrix);
          arrowIdx++;
        }
        vectorMesh.count = arrowIdx;
        vectorMesh.instanceMatrix.needsUpdate = true;
      } else {
        vectorMesh.visible = false;
      }

      // ── Argo Float Markers & Vertical Profiles ─────────────────────────────
      const floatList = current.floats || [];
      const floatCount = Math.min(floatList.length, 256);
      markerMesh.count = floatCount;

      const surfaceY = 4.8;
      const tetherArray = tetherPositions;

      floatList.slice(0, floatCount).forEach((fl, idx) => {
        const fx = ((Number(fl.lng ?? fl.lon) - west) / Math.max(east - west, 0.0001) - 0.5) * modelWidth;
        const fz = ((Number(fl.lat) - south) / Math.max(north - south, 0.0001) - 0.5) * modelDepth;
        const flDepth = Number(fl.depth ?? fl.data_depth ?? 50);
        const fy = computeElevation(maxVal, minVal, valRange, flDepth, exag);

        position.set(fx, fy, fz);
        scale.set(1.1, 1.1, 1.1);
        rotation.set(0, 0, 0);
        quaternion.setFromEuler(rotation);
        matrix.compose(position, quaternion, scale);
        markerMesh.setMatrixAt(idx, matrix);

        // Tether line from surface down to float depth
        const pOffset = idx * 6;
        tetherArray[pOffset] = fx;
        tetherArray[pOffset + 1] = surfaceY;
        tetherArray[pOffset + 2] = fz;

        tetherArray[pOffset + 3] = fx;
        tetherArray[pOffset + 4] = fy;
        tetherArray[pOffset + 5] = fz;
      });

      markerMesh.instanceMatrix.needsUpdate = true;
      tetherLines.geometry.attributes.position.needsUpdate = true;
    };

    update();

    // ── Resize ──
    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    // ── Mouse Interaction & Tooltip ──
    const onPointerMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hit = raycaster.intersectObject(markerMesh)[0];
      if (hit && dataRef.current.floats[hit.instanceId]) {
        const fl = dataRef.current.floats[hit.instanceId];
        hoveredFloat = fl;
        renderer.domElement.style.cursor = 'pointer';

        if (tooltipRef.current) {
          const wmo = fl.platform_number || fl.id || 'Argo';
          const temp = fl.temperature != null ? `${Number(fl.temperature).toFixed(2)}°C` : '—';
          const sal = fl.salinity != null ? `${Number(fl.salinity).toFixed(2)} PSU` : '—';
          const d = fl.depth != null ? `${Math.round(fl.depth)}m` : '0m';

          tooltipRef.current.style.display = 'block';
          tooltipRef.current.style.left = `${event.clientX - rect.left}px`;
          tooltipRef.current.style.top = `${event.clientY - rect.top}px`;
          tooltipRef.current.innerHTML = `
            <strong>Float #${wmo}</strong><br/>
            Depth: ${d}<br/>
            Temp: ${temp} | Sal: ${sal}<br/>
            <span style="color:#38bdf8; font-size:10px;">Click to view full depth profile</span>
          `;
        }
      } else {
        hoveredFloat = null;
        renderer.domElement.style.cursor = 'default';
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      }
    };

    const onClick = () => {
      if (hoveredFloat) {
        onSelectMarker?.(hoveredFloat);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    // ── Animation Loop ──
    let frame;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    sceneRef.current = { update };

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      voxelGeo.dispose();
      voxelMat.dispose();
      arrowGeo.dispose();
      arrowMat.dispose();
      floatGeo.dispose();
      floatMat.dispose();
      boxGeo.dispose();
      boxMat.dispose();
      activeFrameGeo.dispose();
      activeFrameMat.dispose();
      tetherLinesGeo.dispose();
      tetherMat.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      if (mount.contains(hud)) mount.removeChild(hud);
      if (mount.contains(tooltip)) mount.removeChild(tooltip);
      hudRef.current = null;
      tooltipRef.current = null;
    };
  }, [onSelectMarker]);

  useEffect(() => {
    sceneRef.current?.update();
  }, [
    depthSlices,
    volumeData,
    grid,
    floats,
    variable,
    depth,
    dataDepth,
    bounds,
    opacity,
    verticalExaggeration,
    threshold,
    source,
    dataSource,
    backupDate,
    regionName,
  ]);

  return (
    <div
      ref={mountRef}
      className="ocean-slab-canvas w-full h-full relative overflow-hidden"
      aria-label="3D Ocean Volume Stack"
    />
  );
}

export { DEPTH_BINS };
